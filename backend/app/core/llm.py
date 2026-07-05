"""
Lapisan LLM buat fitur hint quiz / Misconception Probe.

LLMProvider itu "kontrak" abstrak: siapapun providernya (DeepSeek beneran atau
Dummy buat offline) harus punya method yang sama. Jadi kode pemanggil di
routers/exercises.py gak peduli provider apa yang lagi dipakai.

Tiga tugas utama providernya:
1. generate_misconception_probe — bikin 3 soal kuis konsep buat siswa yang nyangkut.
2. generate_confirmation_question — pertanyaan lanjutan "kenapa/gimana" habis
   siswa jawab bener, buat mastiin dia paham beneran (bukan nebak hoki).
3. judge_understanding — nilai (0-100) seberapa paham dari penjelasan siswa.

Aturan emas di SEMUA prompt: jangan pernah bocorin jawaban benarnya.
"""
from abc import ABC, abstractmethod
import urllib.request
import urllib.error
import json
import asyncio
import os
import httpx

from app.core.config import settings

class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, **kwargs) -> str:
        """Method inti: kirim prompt, dapetin teks balasan mentah dari LLM.
        Method lain di kelas ini nyusun prompt terus manggil generate() ini."""
        pass

    async def generate_misconception_probe(
        self,
        kc_focus: str,
        problem_title: str | None,
        problem_description: str | None,
        lang: str = "en",
    ) -> list[dict]:
        """
        Bikin PERSIS 3 soal konsep (Misconception Probe) buat satu fokus KC.
        Spesifikasi bahasa DAP ikut ditempelin ke prompt biar LLM ngerti
        sintaks yang bener pas bikin soal.
        """
        # Muat dulu spesifikasi bahasa DAP biar soal yang dibikin nyambung.
        dap_prompt = get_dap_prompt()

        prompt = f"""{dap_prompt}

---

## Task: Generate Concept Check Exercises
The student is currently stuck on a homework problem focusing on the concept: "{kc_focus}".
Problem Context:
- Title: {problem_title or "Unknown"}
- Description: {problem_description or "Unknown"}

Generate exactly 3 conceptual exercises (Intermediate Exercises) to test their understanding of this topic and help them progress.
Each exercise can be multiple choice (type: "mc") or short answer (type: "sa").
For MC questions, provide a list of exactly 4 options.
For SA questions, options_en and options_id must be null. Keep the correct answer short and simple (e.g. 1-2 words, or syntactically correct operator sequence like `<-`).

Bilingual Translation Requirement:
You MUST provide both English and Indonesian translations for:
1. The question text ('text_en' and 'text_id')
2. The multiple-choice options ('options_en' and 'options_id')
3. The Socratic feedback ('explanation_en' and 'explanation_id')

Socratic Feedback Rules (very important):
The 'explanation' is shown as tutor feedback to a student who answered the question incorrectly. It must help them think deeper, not give the answer away:
- Do NOT state, quote, or reveal the correct answer, its option letter, or its exact text.
- Do NOT say which option is correct or describe it recognizably.
- Instead, point at the underlying concept and ask ONE short guiding question that leads the student to re-reason (e.g. "What happens to the old value when you assign over it? Try tracing it line by line.").
- Be supportive and encouraging. Keep it under 50 words.

For SA (short answer) questions, the 'options_en' and 'options_id' should both be null. The 'answer' string should contain the correct answer (usually code or symbol which is language-independent).

You MUST respond ONLY with a raw JSON array of exactly 3 objects. Do not include markdown block formatting (like ```json) or any conversational text.

Each object in the JSON array must have these keys exactly:
- "type": "mc" or "sa"
- "text_en": string (the question text in English)
- "text_id": string (the question text in Indonesian)
- "code": string (optional code snippet, or null)
- "options_en": list of 4 strings (options in English, or null)
- "options_id": list of 4 strings (options in Indonesian, or null)
- "answer": string (A, B, C, or D for MC; exact short string for SA)
- "explanation_en": string (the Socratic feedback in English — no answer reveal)
- "explanation_id": string (the Socratic feedback in Indonesian — no answer reveal)
"""

        response_text = await self.generate(prompt)

        # LLM sering ngebungkus JSON pakai ```json ... ``` — buang dulu pagarnya
        # biar json.loads gak error.
        clean_text = response_text.strip()
        if clean_text.startswith("```"):
            lines = clean_text.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            clean_text = "\n".join(lines).strip()

        # Wajib berupa list minimal 3 soal; kalau nggak, biar caller yang
        # nangani (biasanya fallback ke soal statis).
        data = json.loads(clean_text)
        if not isinstance(data, list) or len(data) < 3:
            raise ValueError("LLM did not return a JSON list of at least 3 exercises")

        return data[:3]  # Ambil 3 pertama aja, sisanya (kalau ada) dibuang.

    async def generate_confirmation_question(
        self,
        question_text: str,
        student_answer: str,
        kc_focus: str | None,
        lang: str = "en",
    ) -> dict:
        """
        Habis siswa jawab soal Misconception Probe dengan BENAR, bikin satu
        pertanyaan lanjutan gaya "kenapa/gimana" yang nyuruh dia jelasin
        alasannya — biar ketahuan dia paham beneran, bukan cuma hoki nebak.

        Balikin {"question_en": str, "question_id": str}. WAJIB gak bocorin jawaban.
        """
        prompt = f"""You are a Socratic computer-science tutor. A student just answered a concept-check question CORRECTLY.
Concept being tested: "{kc_focus or 'introductory programming'}".

Question they answered:
\"\"\"{question_text}\"\"\"

Their (correct) answer: "{student_answer}"

Write ONE short, open-ended follow-up question that prompts the student to explain WHY or HOW their answer is correct, so we can check they truly understand instead of having guessed. Examples of the desired style: "What made you choose that answer?", "How does that actually happen step by step?", "Why does that work?".

Rules:
- Ask for reasoning ("why" / "how"), never a yes/no question.
- Do NOT restate or reveal the correct answer.
- Keep it under 25 words, warm and encouraging.
- Provide both English and Indonesian.

Respond ONLY with a raw JSON object (no markdown fences, no extra text) with exactly these keys:
- "question_en": string
- "question_id": string
"""
        response_text = await self.generate(prompt)
        data = json.loads(_strip_code_fences(response_text))
        if not isinstance(data, dict) or "question_en" not in data:
            raise ValueError("LLM did not return a valid confirmation-question object")
        return {
            "question_en": str(data.get("question_en", "")).strip(),
            "question_id": str(data.get("question_id", "") or data.get("question_en", "")).strip(),
        }

    async def judge_understanding(
        self,
        confirm_question: str,
        student_explanation: str,
        question_text: str,
        student_answer: str,
        kc_focus: str | None,
        lang: str = "en",
    ) -> dict:
        """
        Nilai seberapa bagus penjelasan bebas siswa nunjukin dia paham konsepnya,
        dalam bentuk persen bulat 0-100.

        Balikin {"score": int, "feedback_en": str, "feedback_id": str}.
        """
        prompt = f"""You are grading whether a student TRULY understands a concept, based on how they explain their reasoning.

Concept being tested: "{kc_focus or 'introductory programming'}".
Original question:
\"\"\"{question_text}\"\"\"
Student's answer to it: "{student_answer}"

We then asked the student to justify their reasoning:
\"\"\"{confirm_question}\"\"\"
The student's explanation:
\"\"\"{student_explanation}\"\"\"

Judge ONLY the explanation. Award a percentage score from 0 to 100 for how well it demonstrates real conceptual understanding:
- 85-100: clearly explains the underlying reason/mechanism in their own words.
- 70-84: mostly correct reasoning with minor gaps.
- 40-69: vague, partially correct, or restates the answer without explaining why/how.
- 0-39: empty, off-topic, incorrect, or "I don't know".

Then write ONE short (under 40 words) piece of encouraging feedback. If the score is high, affirm what they got right. If low, gently nudge them to think about the mechanism WITHOUT revealing the answer.

Respond ONLY with a raw JSON object (no markdown fences, no extra text) with exactly these keys:
- "score": integer between 0 and 100
- "feedback_en": string
- "feedback_id": string
"""
        response_text = await self.generate(prompt)
        data = json.loads(_strip_code_fences(response_text))
        if not isinstance(data, dict) or "score" not in data:
            raise ValueError("LLM did not return a valid understanding-judgement object")
        try:
            score = int(round(float(data.get("score", 0))))
        except (TypeError, ValueError):
            raise ValueError("LLM returned a non-numeric understanding score")
        score = max(0, min(100, score))
        return {
            "score": score,
            "feedback_en": str(data.get("feedback_en", "")).strip(),
            "feedback_id": str(data.get("feedback_id", "") or data.get("feedback_en", "")).strip(),
        }


def _strip_code_fences(text: str) -> str:
    """Buang pagar Markdown ``` yang kadang dipakai model buat mbungkus JSON."""
    clean_text = (text or "").strip()
    if clean_text.startswith("```"):
        lines = clean_text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        clean_text = "\n".join(lines).strip()
    return clean_text


def heuristic_understanding_score(student_explanation: str, student_answer: str = "") -> dict:
    """
    Nilai kualitas penjelasan TANPA LLM — cadangan pas gak ada LLM beneran
    yang dikonfigurasi atau pas panggilan ke LLM gagal. Ngasih nilai lebih
    ke penjelasan yang cukup panjang dan pakai kata sebab-akibat ("karena",
    "sehingga", "maka", dst), bukan yang cuma ngulang jawaban doang.
    """
    text = (student_explanation or "").strip()
    words = [w for w in text.split() if w.strip()]
    word_count = len(words)

    if word_count == 0:
        return {
            "score": 0,
            "feedback_en": "It looks like your explanation was empty. Try describing your reasoning in a sentence or two.",
            "feedback_id": "Sepertinya penjelasanmu masih kosong. Coba jelaskan alasanmu dalam satu atau dua kalimat.",
        }

    reasoning_markers = (
        "because", "since", "so that", "so ", "therefore", "then", "when", "if ",
        "store", "value", "order", "before", "after", "swap", "loop", "step",
        "karena", "sehingga", "maka", "kemudian", "sebelum", "sesudah", "nilai", "menyimpan",
    )
    lower = text.lower()
    marker_hits = sum(1 for m in reasoning_markers if m in lower)

    # Nilai dasar naik ngikutin panjang jawaban; kata penanda alasan nambah bonus.
    length_score = min(60, word_count * 6)
    depth_score = min(40, marker_hits * 12)
    score = max(0, min(100, length_score + depth_score))

    # Jawaban super pendek tanpa penanda alasan (cuma ngulang jawaban) gak boleh lolos.
    if word_count <= 3 and marker_hits == 0:
        score = min(score, 45)

    if score >= 70:
        feedback_en = "Great — you explained the reasoning behind your answer clearly."
        feedback_id = "Bagus — kamu menjelaskan alasan di balik jawabanmu dengan jelas."
    else:
        feedback_en = "You're on the right track, but try to explain the mechanism — what actually happens and why."
        feedback_id = "Kamu di jalur yang benar, tetapi coba jelaskan mekanismenya — apa yang sebenarnya terjadi dan mengapa."

    return {"score": score, "feedback_en": feedback_en, "feedback_id": feedback_id}


# Provider "boongan" buat dev/offline: gak manggil API manapun, balikin teks statis.
class DummyLLMProvider(LLMProvider):
    async def generate(self, prompt: str, **kwargs) -> str:
        # Hint Socratic statis biar alur tetep jalan walau tanpa LLM beneran.
        return (
            "💡 **Tutor Hint (Mock)**: Check the order of your assignments! "
            "If you overwrite your variable before copying its value to your helper variable, "
            "the original value is lost. Draw the variables on paper and trace their values step-by-step."
        )

    async def generate_misconception_probe(self, *args, **kwargs) -> list[dict]:
        raise ValueError("DummyLLMProvider cannot generate structured quiz questions.")

    async def generate_confirmation_question(
        self, question_text, student_answer, kc_focus, lang="en"
    ) -> dict:
        # Static reflective prompt so the confirmation flow still works without a real LLM.
        return {
            "question_en": "Nice — that's correct! In your own words, why is that the right answer? Walk me through your reasoning.",
            "question_id": "Bagus — itu benar! Dengan kata-katamu sendiri, mengapa itu jawaban yang tepat? Jelaskan alasanmu.",
        }

    async def judge_understanding(
        self, confirm_question, student_explanation, question_text, student_answer, kc_focus, lang="en"
    ) -> dict:
        return heuristic_understanding_score(student_explanation, student_answer)

# Provider asli: nembak API DeepSeek lewat HTTP.
class DeepSeekLLMProvider(LLMProvider):
    async def generate(self, prompt: str, **kwargs) -> str:
        api_key = settings.LLM_API_KEY
        # Kalau API key belum diisi, jangan error — kasih hint fallback aja.
        if not api_key or api_key == "dummy-api-key":
            return (
                "💡 **Tutor Hint (Local Fallback)**: DeepSeek API Key is not configured. "
                "Trace your code manually. If this is a variable swap, did you store the original value in `temp` first? "
                "If this is a factorial, did you initialize the multiplier and loop correctly?"
            )
            
        url = "https://api.deepseek.com/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        system_content = kwargs.get(
            "system_prompt", 
            "You are a friendly, supportive computer science tutor helping a student learn pseudocode. "
            "Write in a supportive and guiding Socratic style. DO NOT output the final solution code."
        )
        model = kwargs.get("model", "deepseek-v4-flash")
        
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_content},
                {"role": "user", "content": prompt}
            ],
            "temperature": kwargs.get("temperature", 0.2)
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=12.0
                )
                response.raise_for_status()
                resp_json = response.json()
                return resp_json["choices"][0]["message"]["content"]
                
        except httpx.HTTPStatusError as hse:
            try:
                err_json = hse.response.json()
                err_msg = err_json.get("error", {}).get("message", str(hse))
            except Exception:
                err_msg = str(hse)
            return f"DeepSeek API Error: {err_msg}"
        except Exception as e:
            return f"Failed to connect to DeepSeek API: {str(e)}"

# Factory: pilih provider sesuai setting LLM_PROVIDER. Ini satu-satunya
# tempat provider dibikin, jadi ganti provider cukup ubah config.
def get_llm_provider() -> LLMProvider:
    provider = settings.LLM_PROVIDER.lower()
    if provider == "dummy":
        return DummyLLMProvider()
    elif provider.startswith("deepseek"):
        return DeepSeekLLMProvider()
    else:
        raise ValueError(f"Unknown LLM Provider: {settings.LLM_PROVIDER}")

def get_dap_prompt() -> str:
    """Baca spesifikasi & sintaks bahasa DAP dari backend/dap_llm_prompt.md.
    Isinya ditempelin ke prompt biar LLM bikin soal yang sesuai bahasa DAP."""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        # llm.py is in backend/app/core/
        # Move up 3 directories to reach backend/
        prompt_path = os.path.abspath(os.path.join(current_dir, "..", "..", "dap_llm_prompt.md"))
        if os.path.exists(prompt_path):
            with open(prompt_path, "r", encoding="utf-8") as f:
                return f.read()
    except Exception as e:
        print(f"Warning: could not load dap_llm_prompt.md: {e}")
    return ""





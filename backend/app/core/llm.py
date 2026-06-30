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
        """Generate response from the LLM provider."""
        pass

class DummyLLMProvider(LLMProvider):
    async def generate(self, prompt: str, **kwargs) -> str:
        # Realistic Socratic fallback hint
        return (
            "💡 **Tutor Hint (Mock)**: Check the order of your assignments! "
            "If you overwrite your variable before copying its value to your helper variable, "
            "the original value is lost. Draw the variables on paper and trace their values step-by-step."
        )

class DeepSeekLLMProvider(LLMProvider):
    async def generate(self, prompt: str, **kwargs) -> str:
        api_key = settings.LLM_API_KEY
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

def get_llm_provider() -> LLMProvider:
    provider = settings.LLM_PROVIDER.lower()
    if provider == "dummy":
        return DummyLLMProvider()
    elif provider.startswith("deepseek"):
        return DeepSeekLLMProvider()
    else:
        raise ValueError(f"Unknown LLM Provider: {settings.LLM_PROVIDER}")

def get_dap_prompt() -> str:
    """Reads the DAP syntax and specification prompt from backend/dap_llm_prompt.md."""
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


async def generate_intermediate_exercises(
    kc_focus: str,
    problem_title: str | None,
    problem_description: str | None,
    lang: str = "en",
) -> list[dict]:
    """
    Generates exactly 3 conceptual exercises (Intermediate Exercises) for a given KC focus.
    Integrates the DAP language prompt/specification to instruct the LLM properly.
    """
    llm = get_llm_provider()
    if isinstance(llm, DummyLLMProvider):
        raise ValueError("DummyLLMProvider cannot generate structured quiz questions.")

    dap_prompt = get_dap_prompt()

    lang_instruction = (
        "Generate the quiz question text ('text'), the options ('options'), and the explanation ('explanation') in Indonesian. Technical terms can be in Indonesian or English."
        if lang == "id"
        else "Generate the quiz question text ('text'), the options ('options'), and the explanation ('explanation') in English."
    )

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
For SA questions, options must be null. Keep the correct answer short and simple (e.g. 1-2 words, or syntactically correct operator sequence like `<-`).

Language Constraint: {lang_instruction}

You MUST respond ONLY with a raw JSON array of exactly 3 objects. Do not include markdown block formatting (like ```json) or any conversational text.

Each object in the JSON array must have these keys exactly:
- "type": "mc" or "sa"
- "text": string (the question text)
- "code": string (optional code snippet, or null)
- "options": list of 4 strings (or null)
- "answer": string (A, B, C, or D for MC; exact short string for SA)
- "explanation": string (why the answer is correct)
"""

    response_text = await llm.generate(prompt)

    # Clean up Markdown formatting from response if present
    clean_text = response_text.strip()
    if clean_text.startswith("```"):
        lines = clean_text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines[-1].startswith("```"):
            lines = lines[:-1]
        clean_text = "\n".join(lines).strip()

    data = json.loads(clean_text)
    if not isinstance(data, list) or len(data) < 3:
        raise ValueError("LLM did not return a JSON list of at least 3 exercises")

    return data[:3]



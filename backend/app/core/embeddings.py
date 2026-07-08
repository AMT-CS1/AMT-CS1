"""
Fungsi-fungsi embedding via OpenRouter (openai/text-embedding-3-small, 1536 dim).

Dipakai oleh:
- scripts/build_misconception_embeddings.py (batch, baca excel -> parquet)
- (nanti) endpoint FastAPI yang butuh embed teks on-the-fly, mis. saat LLM
  menggenerate misconception baru secara real-time dan perlu langsung
  di-embed untuk masuk katalog RAG.

Kenapa async: konsisten dengan seluruh AMT-CS1 yang async-first (FastAPI).
Script batch tetap bisa memanggilnya lewat asyncio.run()/loop biasa.
"""
import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx

OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
MODEL_ID = "openai/text-embedding-3-small"
EXPECTED_DIM = 1536

# Retry sederhana: beberapa kali percobaan dengan jeda naik, untuk error
# transient (timeout, rate limit, 5xx) -- bukan untuk error permanen (400/401/403).
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2
REQUEST_TIMEOUT_SECONDS = 30


@dataclass
class EmbeddingResult:
    """Hasil satu panggilan embedding, lengkap dengan metadata kualitas/biaya."""
    embedding: Optional[list[float]]
    token_count: Optional[int]
    latency_ms: float
    status: str            # "ok" atau "error"
    error_message: Optional[str] = None
    model: str = MODEL_ID


def build_embedding_text(description: str, example: str | None) -> str:
    """
    Susun teks yang akan di-embed: description + example (kalau ada dan
    bukan placeholder kosong "-"). Dipisah jadi fungsi sendiri supaya cara
    menyusun teks embedding konsisten di semua pemanggil (script maupun
    endpoint), tidak ada yang menyusun format beda-beda sendiri.
    """
    text = description.strip()
    if example and example.strip() and example.strip() != "-":
        text = f"{text}\n\nContoh: {example.strip()}"
    return text


async def get_embedding(text: str, api_key: str | None = None) -> EmbeddingResult:
    """
    Panggil OpenRouter embeddings endpoint sekali untuk satu teks.

    Satu panggilan per teks (bukan batch) -- supaya token_count & latency_ms
    bisa dicatat akurat per entri untuk analisis kualitas/biaya. Kalau perlu
    embed banyak teks sekaligus, panggil fungsi ini berulang (lihat
    scripts/build_misconception_embeddings.py), atau bikin varian batch
    terpisah kalau nanti volumenya besar dan token-per-entri tak lagi krusial.

    api_key: kalau None, diambil dari env var OPEN_ROUTER_API_KEY.
    """
    resolved_key = api_key or os.environ.get("OPEN_ROUTER_API_KEY")
    if not resolved_key:
        return EmbeddingResult(
            embedding=None,
            token_count=None,
            latency_ms=0.0,
            status="error",
            error_message="OPEN_ROUTER_API_KEY tidak di-set (env var maupun parameter).",
        )

    headers = {
        "Authorization": f"Bearer {resolved_key}",
        "Content-Type": "application/json",
    }
    payload = {"model": MODEL_ID, "input": text}

    last_error: str | None = None
    latency_ms = 0.0

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        for attempt in range(1, MAX_RETRIES + 1):
            start = time.perf_counter()
            try:
                resp = await client.post(OPENROUTER_EMBEDDINGS_URL, headers=headers, json=payload)
                latency_ms = round((time.perf_counter() - start) * 1000, 2)

                if resp.status_code != 200:
                    last_error = f"HTTP {resp.status_code}: {resp.text[:300]}"
                    # Error permanen (API key salah / request invalid) -- gak ada
                    # gunanya di-retry, langsung berhenti.
                    if resp.status_code in (400, 401, 403):
                        break
                    time.sleep(RETRY_BACKOFF_SECONDS * attempt)
                    continue

                data = resp.json()
                embedding = data["data"][0]["embedding"]
                token_count = data.get("usage", {}).get("prompt_tokens")

                if len(embedding) != EXPECTED_DIM:
                    last_error = (
                        f"Dimensi embedding {len(embedding)} != {EXPECTED_DIM} yang "
                        f"diharapkan (kolom DB Vector({EXPECTED_DIM}))"
                    )
                    break

                return EmbeddingResult(
                    embedding=embedding,
                    token_count=token_count,
                    latency_ms=latency_ms,
                    status="ok",
                    error_message=None,
                )

            except httpx.HTTPError as e:
                latency_ms = round((time.perf_counter() - start) * 1000, 2)
                last_error = f"{type(e).__name__}: {e}"
                time.sleep(RETRY_BACKOFF_SECONDS * attempt)

    return EmbeddingResult(
        embedding=None,
        token_count=None,
        latency_ms=latency_ms,
        status="error",
        error_message=last_error,
    )
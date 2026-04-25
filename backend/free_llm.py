from __future__ import annotations

import os
from typing import Any

import httpx


def _ollama_base_url() -> str:
    return os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")


def _ollama_model() -> str:
    # Good free defaults: "llama3.1:8b", "phi3:mini", "mistral:7b"
    return os.getenv("OLLAMA_MODEL", "llama3.1:8b")


async def ollama_generate(prompt: str) -> str:
    """
    Free local LLM via Ollama. Requires Ollama running on the host.
    """
    base = _ollama_base_url()
    model = _ollama_model()

    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
    }

    timeout = httpx.Timeout(30.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(f"{base}/api/generate", json=payload)
        r.raise_for_status()
        data = r.json()
        return (data.get("response") or "").strip()


async def try_free_llm_answer(prompt: str) -> tuple[str | None, str]:
    """
    Returns (answer_or_none, mode).
    mode is one of: "ollama" | "fallback"
    """
    try:
        text = await ollama_generate(prompt)
        if text:
            return text, "ollama"
    except Exception:
        pass
    return None, "fallback"


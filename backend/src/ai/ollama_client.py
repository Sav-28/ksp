"""
Thin client for a locally-running Ollama instance.

Used by the language provider to turn natural-language crime queries into
structured JSON. Runs entirely on-machine (no external API, no per-query cost,
data never leaves the server) — important for sensitive police data.
"""
import os
import json
import logging
import requests

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "120"))


def is_available() -> bool:
    """Quick health check — is the Ollama server reachable?"""
    try:
        requests.get(f"{OLLAMA_URL}/api/tags", timeout=2)
        return True
    except Exception:
        return False


def warmup() -> bool:
    """
    Pre-load the model into memory so the first real query isn't slow
    (avoids cold-start fallback to the rule engine). Best-effort.
    """
    try:
        requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [{"role": "user", "content": "ok"}],
                "stream": False,
                "keep_alive": "30m",
                "options": {"num_predict": 1},
            },
            timeout=180,
        )
        logging.info(f"Ollama model '{OLLAMA_MODEL}' warmed up.")
        return True
    except Exception as e:
        logging.warning(f"Ollama warmup failed: {e}")
        return False


def chat_json(system_prompt: str, user_prompt: str, timeout: float = OLLAMA_TIMEOUT) -> dict:
    """
    Send a chat request to Ollama constrained to JSON output and return the
    parsed dict. Raises on transport error or invalid JSON.
    """
    resp = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "format": "json",          # constrain the model to valid JSON
            "keep_alive": "30m",       # keep the model resident between queries
            "options": {"temperature": 0},  # deterministic extraction
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    content = resp.json().get("message", {}).get("content", "")
    if not content:
        raise ValueError("Empty response from Ollama")
    return json.loads(content)

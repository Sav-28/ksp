"""
Catalyst QuickML LLM Serving client.

Mirrors the ollama_client.chat_json() interface so language_provider.py
can swap providers with a single env-var change: KSP_NLP_PROVIDER=quickml.

HOW CATALYST QUICKML LLM SERVING WORKS
---------------------------------------
The SDK's app.quick_ml().predict() is for custom ML pipeline endpoints
(regression, classification) — NOT for LLM chat. The LLM Serving feature
(GLM-4.7-Flash, Qwen3.6-35B) exposes its own REST endpoint that you create
in the console under QuickML → Generative AI → LLM Serving → Create Endpoint.

That endpoint requires two headers for auth:
    Authorization: Zoho-oauthtoken <access_token>
    CATALYST-ORG:  <org_id>

On AppSail the Catalyst SDK can mint a fresh OAuth token via the project
credentials it already holds. We retrieve it through the SDK's connection
helper (the same mechanism the Invoice Notifier tutorial uses for Cliq).
The fallback — for local dev where the SDK is not initialised — is a plain
Bearer token from KSP_QUICKML_API_KEY.

Configuration (env vars):
    KSP_QUICKML_ENDPOINT_URL    Full URL shown on the endpoint details page
                                e.g. https://api.catalyst.zoho.com/quickml/
                                         v1/project/12345/endpoints/predict
    KSP_QUICKML_ORG_ID          CATALYST-ORG value (numeric org/project id)
                                shown on the same endpoint details page
    KSP_QUICKML_API_KEY         OAuth access token OR static API key
                                (optional fallback for local dev)
    KSP_QUICKML_MODEL           Display name only — used in the "engine" field
                                returned to chat.py for the evidence trail
                                (default: "quickml-llm")
    KSP_QUICKML_TIMEOUT         Request timeout in seconds (default: 120)

The endpoint itself bakes in the model choice (you selected it in the console
when you created the endpoint), so QUICKML_MODEL here is just a label.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

import requests

log = logging.getLogger(__name__)

QUICKML_ENDPOINT_URL = os.getenv("KSP_QUICKML_ENDPOINT_URL", "").strip()
QUICKML_ORG_ID = os.getenv("KSP_QUICKML_ORG_ID", "").strip()
QUICKML_API_KEY = os.getenv("KSP_QUICKML_API_KEY", "").strip()
QUICKML_MODEL = os.getenv("KSP_QUICKML_MODEL", "quickml-llm")
QUICKML_TIMEOUT = float(os.getenv("KSP_QUICKML_TIMEOUT", "120"))


def _get_oauth_token() -> Optional[str]:
    """
    Retrieve an OAuth access token via the Catalyst SDK connection helper.

    This works on AppSail where the SDK is initialised from the gateway headers.
    Returns None on any failure so the caller falls back to KSP_QUICKML_API_KEY.
    """
    try:
        from src.services.catalyst import get_app
        app = get_app()
        if app is None:
            return None
        # The SDK's connection() helper can exchange a refresh token or use the
        # project's own credentials. On AppSail the project secret key is present
        # in the x-zc-* headers the gateway injects, so initialize() already
        # holds valid credentials — we just need to materialise a token.
        #
        # The Catalyst Python SDK (1.4.0) exposes credential().get_access_token()
        # on the app object for exactly this purpose.
        cred = getattr(app, "credential", None) or getattr(app, "_credential", None)
        if cred is None:
            return None
        token_fn = getattr(cred, "get_access_token", None)
        if callable(token_fn):
            return str(token_fn())
        return None
    except Exception as exc:
        log.debug("QuickML: could not retrieve OAuth token via SDK: %s", exc)
        return None


def _auth_headers() -> dict:
    """
    Build the Authorization + CATALYST-ORG headers for a QuickML LLM request.

    Tries the SDK-minted OAuth token first; falls back to the static API key
    configured in KSP_QUICKML_API_KEY for local dev / CI.
    """
    token = _get_oauth_token() or QUICKML_API_KEY
    h: dict = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Zoho-oauthtoken {token}"
    if QUICKML_ORG_ID:
        h["CATALYST-ORG"] = QUICKML_ORG_ID
    return h


def is_available() -> bool:
    """True when the endpoint URL is configured and reachable."""
    if not QUICKML_ENDPOINT_URL:
        return False
    try:
        r = requests.head(QUICKML_ENDPOINT_URL, timeout=3,
                          headers=_auth_headers())
        return r.status_code < 500
    except Exception:
        return False


def chat_json(system_prompt: str, user_prompt: str,
              timeout: float = QUICKML_TIMEOUT) -> dict:
    """
    Send a single-shot chat request to the QuickML LLM Serving endpoint and
    return the parsed JSON response dict.

    The QuickML LLM Serving endpoint accepts an OpenAI-compatible request body
    (messages array) and returns choices[0].message.content as a string.
    We ask the model to return only JSON via the system prompt; there is no
    server-side response_format enforcement at the QuickML level (unlike
    OpenAI's json_object mode), so _sanitize() in language_provider.py is the
    safety net.

    Raises on transport error or unparseable response so the caller's
    try/except falls through to the rule-based NLP fallback unchanged.
    """
    if not QUICKML_ENDPOINT_URL:
        raise ValueError(
            "KSP_QUICKML_ENDPOINT_URL is not set. "
            "Create an LLM Serving endpoint in the Catalyst console under "
            "QuickML → Generative AI → LLM Serving → Create Endpoint, then "
            "copy the Endpoint URL here."
        )

    # QuickML LLM Serving accepts the same messages array as OpenAI.
    # temperature=0 is passed for deterministic extraction but the model may
    # ignore it — the system prompt instructs JSON-only output as the guard.
    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
    }

    resp = requests.post(
        QUICKML_ENDPOINT_URL,
        json=payload,
        headers=_auth_headers(),
        timeout=timeout,
    )
    resp.raise_for_status()

    body = resp.json()

    # QuickML LLM Serving mirrors the OpenAI response shape:
    # { "choices": [{ "message": { "content": "<json string>" } }] }
    choices = body.get("choices") or []
    if not choices:
        raise ValueError(f"QuickML returned no choices. Full response: {body}")

    content = (choices[0].get("message") or {}).get("content", "")
    if not content:
        raise ValueError("QuickML returned an empty message content.")

    # The model should return a JSON object per the system prompt. Strip any
    # markdown code fences the model might add despite being asked not to.
    content = content.strip()
    if content.startswith("```"):
        # Strip ```json ... ``` or ``` ... ```
        lines = content.splitlines()
        content = "\n".join(
            l for l in lines
            if not l.strip().startswith("```")
        ).strip()

    return json.loads(content)

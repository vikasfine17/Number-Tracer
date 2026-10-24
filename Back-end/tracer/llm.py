"""One function, two providers. Gemma through Ollama is the open default; Gemini is optional.
The model is only used to read the claim. Verdicts are computed in plain code."""
import logging
import os

import requests

log = logging.getLogger("tracer.llm")


def _ollama(prompt, json_mode, timeout, temperature=None):
    url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    model = os.getenv("TRACER_MODEL", "gemma4")
    body = {"model": model, "prompt": prompt, "stream": False, "think": False}
    if json_mode:
        body["format"] = "json"
    if temperature is not None:
        body["options"] = {"temperature": float(temperature)}
    r = requests.post(url + "/api/generate", json=body, timeout=timeout)
    if r.status_code == 404:
        try:
            tags_r = requests.get(url + "/api/tags", timeout=5)
            if tags_r.ok:
                models = tags_r.json().get("models", [])
                if models:
                    alt_model = models[0]["name"]
                    log.info("Model %s not found in Ollama, using available model %s", model, alt_model)
                    body["model"] = alt_model
                    r = requests.post(url + "/api/generate", json=body, timeout=timeout)
        except Exception as e:
            log.warning("Ollama tags fallback failed: %s", e)
    r.raise_for_status()
    res = r.json()
    resp_text = (res.get("response") or "").strip()
    if not resp_text and res.get("thinking"):
        resp_text = res["thinking"].strip()
    return resp_text


def _gemini(prompt, json_mode, timeout, temperature=None):
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    body = {"contents": [{"parts": [{"text": prompt}]}]}
    gen_config = {}
    if json_mode:
        gen_config["responseMimeType"] = "application/json"
    if temperature is not None:
        gen_config["temperature"] = float(temperature)
    if gen_config:
        body["generationConfig"] = gen_config
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    r = requests.post(url, headers={"x-goog-api-key": key}, json=body, timeout=timeout)
    if not r.ok and model != "gemini-3.5-flash-lite":
        log.warning("Gemini model %s returned %s, falling back to gemini-3.5-flash-lite", model, r.status_code)
        alt_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
        r = requests.post(alt_url, headers={"x-goog-api-key": key}, json=body, timeout=timeout)
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


PROVIDERS = {"ollama": _ollama, "gemini": _gemini}


def complete(prompt, provider=None, json_mode=False, timeout=60, temperature=None):
    """Return the model's text, or None if every allowed provider failed.
    Gemini falls back to local Ollama. Ollama never falls back to a cloud service."""
    first = (provider or os.getenv("TRACER_PROVIDER", "ollama")).lower()
    order = [first] + (["ollama"] if first == "gemini" else [])
    for name in order:
        fn = PROVIDERS.get(name)
        if fn is None:
            log.warning("unknown provider %s", name)
            continue
        try:
            return fn(prompt, json_mode, timeout, temperature=temperature)
        except Exception as e:  # network, auth, bad response: try the next one
            log.warning("provider %s failed: %s", name, e)
    return None

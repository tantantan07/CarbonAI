"""
CarbonAI — LLM provider layer
=============================

Every AI call in CarbonAI goes through this module.

Providers (all speak the OpenAI-compatible /chat/completions protocol):

  nugen     -> Nugen Inference API with our *aligned* model (DEFAULT).
               Required by Indradhanu Hackathon 2026 rules: project inference
               must run through a Nugen-aligned model.
  lmstudio  -> LM Studio running locally (http://localhost:1234/v1).
               Free, offline, no credits. Good for development.
  ollama    -> Ollama running locally (http://localhost:11434/v1).
  offline   -> No model. Deterministic rule-based text so the app never
               breaks during a demo. Always labelled as such in responses.

Selection:
  LLM_PROVIDER      primary provider (default: nugen)
  LLM_FALLBACKS     comma list tried in order if the primary fails
                    (default: "offline")

Every response carries `meta` (provider, model, latency, fallback flag) so the
UI can show judges exactly which model produced each answer.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()


@dataclass
class ProviderConfig:
    name: str
    base_url: str
    model: str
    api_key: str | None = None
    timeout: float = 60.0


def _provider_configs() -> dict[str, ProviderConfig]:
    return {
        "nugen": ProviderConfig(
            name="nugen",
            base_url=os.getenv("NUGEN_BASE_URL", "https://api.nugen.in/api/v3/inference"),
            # The model id of the ALIGNED + DEPLOYED model, copied from
            # platform.nugen.in -> Models -> Domain-Aligned Models.
            model=os.getenv("NUGEN_MODEL_ID", ""),
            api_key=os.getenv("NUGEN_API_KEY"),
            timeout=float(os.getenv("NUGEN_TIMEOUT", "60")),
        ),
        "lmstudio": ProviderConfig(
            name="lmstudio",
            base_url=os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
            model=os.getenv("LMSTUDIO_MODEL", "local-model"),
            api_key=os.getenv("LMSTUDIO_API_KEY", "lm-studio"),
            timeout=float(os.getenv("LMSTUDIO_TIMEOUT", "120")),
        ),
        "ollama": ProviderConfig(
            name="ollama",
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
            model=os.getenv("OLLAMA_MODEL", "llama3.2"),
            api_key="ollama",
            timeout=float(os.getenv("OLLAMA_TIMEOUT", "120")),
        ),
    }


def provider_chain(override: str | None = None) -> list[str]:
    primary = (override or os.getenv("LLM_PROVIDER", "nugen")).strip().lower()
    fallbacks = [
        p.strip().lower()
        for p in os.getenv("LLM_FALLBACKS", "offline").split(",")
        if p.strip()
    ]
    chain = [primary] + [p for p in fallbacks if p != primary]
    if "offline" not in chain:
        chain.append("offline")
    return chain


@dataclass
class LLMResult:
    text: str
    meta: dict[str, Any] = field(default_factory=dict)


class LLMError(RuntimeError):
    pass


def _extract_text(data: dict) -> str:
    try:
        choice = data["choices"][0]
        msg = choice.get("message") or {}
        content = msg.get("content")
        if isinstance(content, list):  # some servers return content parts
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        if not content:
            content = choice.get("text", "")
        return (content or "").strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError(f"Unexpected response shape: {json.dumps(data)[:300]}") from exc


def _strip_reasoning(text: str) -> str:
    """Reasoning-aligned models may emit <think>...</think>; hide it from users."""
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    return text.strip()


async def _call_openai_compatible(
    cfg: ProviderConfig,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
) -> LLMResult:
    if cfg.name == "nugen" and (not cfg.api_key or not cfg.model):
        raise LLMError("NUGEN_API_KEY or NUGEN_MODEL_ID is not set")

    headers = {"Content-Type": "application/json", "accept": "application/json"}
    if cfg.api_key:
        headers["Authorization"] = f"Bearer {cfg.api_key}"

    payload = {
        "model": cfg.model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=cfg.timeout) as client:
        resp = await client.post(f"{cfg.base_url.rstrip('/')}/chat/completions", json=payload, headers=headers)
    latency = round((time.perf_counter() - started) * 1000)

    if resp.status_code >= 400:
        raise LLMError(f"{cfg.name} HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    text = _strip_reasoning(_extract_text(data))
    if not text:
        raise LLMError(f"{cfg.name} returned an empty completion")

    return LLMResult(
        text=text,
        meta={
            "provider": cfg.name,
            "model": data.get("model") or cfg.model,
            "latency_ms": latency,
            "usage": data.get("usage"),
        },
    )


async def chat(
    messages: list[dict],
    *,
    temperature: float = 0.3,
    max_tokens: int = 900,
    provider: str | None = None,
    offline_text: str | None = None,
) -> LLMResult:
    """Run a chat completion through the provider chain.

    `offline_text` is the deterministic answer used if every live provider
    fails (the analytics engine always supplies one).
    """
    configs = _provider_configs()
    errors: list[str] = []

    for index, name in enumerate(provider_chain(provider)):
        if name == "offline":
            return LLMResult(
                text=offline_text
                or "AI model is unreachable right now. The numbers above come from CarbonAI's analytics engine.",
                meta={
                    "provider": "offline-rules",
                    "model": "carbonai-rules-v2",
                    "fallback": index > 0,
                    "errors": errors,
                },
            )

        cfg = configs.get(name)
        if not cfg:
            errors.append(f"unknown provider '{name}'")
            continue
        try:
            result = await _call_openai_compatible(cfg, messages, temperature, max_tokens)
            result.meta["fallback"] = index > 0
            if errors:
                result.meta["errors"] = errors
            return result
        except (LLMError, httpx.HTTPError, ValueError) as exc:
            errors.append(f"{name}: {exc}")

    raise LLMError("; ".join(errors))


def status() -> dict:
    cfgs = _provider_configs()
    nugen = cfgs["nugen"]
    return {
        "primary": provider_chain()[0],
        "chain": provider_chain(),
        "nugen": {
            "configured": bool(nugen.api_key and nugen.model),
            "model_id": nugen.model or None,
            "base_url": nugen.base_url,
        },
        "lmstudio": {"base_url": cfgs["lmstudio"].base_url, "model": cfgs["lmstudio"].model},
        "ollama": {"base_url": cfgs["ollama"].base_url, "model": cfgs["ollama"].model},
    }

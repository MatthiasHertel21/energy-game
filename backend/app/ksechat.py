"""
KSE Chat – LLM-assisted scenario editor for designers
Hidden access via /ksechat (designer + admin only)

Supported providers (KSECHAT_PROVIDER env var):
  groq   – Groq Cloud API (llama-3.3-70b-versatile, …)
  gemini – Google Gemini API (gemini-2.0-flash, …)
  openai – OpenAI API (gpt-4o-mini, …)
"""
import json
import os
import re
import pathlib

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required

from .utils import role_required
from .models import Scenario

ns = Namespace("ksechat", description="KSE Chat – LLM-assisted scenario editor")

# ─── API models ───────────────────────────────────────────────────────────────

chat_in = ns.model(
    "KSEChatIn",
    {
        "messages": fields.List(fields.Raw, required=True, description="Conversation history [{role, content}]"),
        "scenario_id": fields.Integer(required=False, description="Optional: load existing scenario as context"),
        "scenario_context": fields.Raw(required=False, description="Optional: pass scenario config directly"),
    },
)

chat_out = ns.model(
    "KSEChatOut",
    {
        "reply": fields.String(description="LLM reply text (JSON blocks stripped)"),
        "scenario_json": fields.Raw(description="Extracted scenario JSON if present"),
        "provider": fields.String(description="LLM provider used"),
        "model": fields.String(description="Model used"),
    },
)

qa_in = ns.model(
    "KSEQAIn",
    {
        "messages": fields.List(fields.Raw, required=True, description="Conversation history [{role, content}]"),
        "context_label": fields.String(required=False, description="Short label for the current page context"),
        "context": fields.Raw(required=False, description="Optional page/session/results context to ground the answer"),
    },
)

qa_out = ns.model(
    "KSEQAOut",
    {
        "reply": fields.String(description="LLM reply text"),
        "provider": fields.String(description="LLM provider used"),
        "model": fields.String(description="Model used"),
    },
)

# ─── Load source code context at startup ─────────────────────────────────────

def _load_code_context() -> str:
    """Read key source files so the LLM can explain calculations."""
    app_dir = pathlib.Path(__file__).parent
    files = [
        ("engine.py", app_dir / "engine.py"),
        ("device_types.py", app_dir / "device_types.py"),
        ("models.py", app_dir / "models.py"),
    ]
    parts = []
    for label, path in files:
        try:
            parts.append(f"### {label}\n```python\n{path.read_text(encoding='utf-8')}\n```")
        except OSError:
            pass
    return "\n\n".join(parts)

_CODE_KEYWORDS = re.compile(
    r"\b(how|why|explain|calculate|formula|algorithm|code|engine|function|dispatch|"
    r"clearing|balancing|kpi|profit|imbalance|curtailment|settlement|merit.?order|"
    r"bid|offer|smp|mcp|ramp|tier|variable.cost|capacity.factor|battery|soc)\b",
    re.IGNORECASE,
)

def _needs_code_context(messages: list) -> bool:
    """Return True only when the latest user message asks about calculations/code."""
    for m in reversed(messages):
        if isinstance(m, dict) and m.get("role") == "user":
            return bool(_CODE_KEYWORDS.search(str(m.get("content", ""))))
    return False

# ─── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an expert AI assistant for the Electricity Market Simulation Game (EMSG/KSE).
You help game designers create and modify scenarios through natural conversation.

## Your behaviour

- **Always respond in plain English.** Be concise and conversational — like a knowledgeable colleague.
- **Never show raw JSON to the user.** When you produce a modified scenario, describe the changes in
  plain language ("I've added a 200 MW wind turbine for Player 2 in Zone 1, reduced the base price
  to 900 ZAR/MWh, and changed clearing to pay-as-bid. Ready to save?") and then append the JSON in
  the hidden marker block described below.
- **Ask before acting if the request is ambiguous.** For example, if the user says "make it harder",
  ask what aspect they want harder (prices, capacity, events, …).
- **Explain calculations when asked.** The full source code of the calculation engine is provided
  below — use it to give accurate, code-grounded explanations.
- **Summarise every change you make** so the designer can quickly verify it.

## Hidden JSON format

When you generate a modified or new scenario config, append it at the very end of your message
using EXACTLY this format (no extra text after the closing marker):

<!-- SCENARIO_JSON_START -->
```json
{ ... }
```
<!-- SCENARIO_JSON_END -->

The frontend will strip this block from the displayed message automatically.
If you are only answering a question (no config change), do NOT include this block.

## Scenario config schema

```json
{
  "general": {
    "horizon_hours": 24, "forecast_horizon_hours": 48, "rounds": 4,
    "round_span_hours": 6, "round_duration_seconds": 300,
    "player_zone": 1, "fake_date": "2024-06-15", "start_time": "00:00"
  },
  "market": {
    "base_price": 1000, "base_volume_mwh": 20000,
    "price_floor": -500, "price_cap": 5000, "clearing_type": "uniform",
    "generator_mix": {
      "coal":    {"blocks": 20, "zone_distribution_pct": [50, 50]},
      "gas":     {"blocks": 30, "zone_distribution_pct": [50, 50]},
      "solar":   {"blocks": 20, "zone_distribution_pct": [50, 50]},
      "wind":    {"blocks": 15, "zone_distribution_pct": [50, 50]},
      "hydro":   {"blocks": 10, "zone_distribution_pct": [50, 50]},
      "nuclear": {"blocks":  5, "zone_distribution_pct": [50, 50]}
    }
  },
  "balancing": {"up_price_zar_per_mwh": 1200.0, "down_price_zar_per_mwh": 800.0},
  "grid": {
    "zones": 2, "atc": [[0, 5000], [5000, 0]], "losses_pct_per_link": 2.0,
    "network_settlement": {
      "extra_cost_mode": "zonal_only", "cost_allocation_target": "consumers_only",
      "shortfall_price_mode": "smp_multiplier", "shortfall_price_value": 2.0
    },
    "generator_curtailment_mode": "pro_rata"
  },
  "environment": {
    "seed": "my-seed-2024",
    "groups": {
      "solar": {"blocks": 20, "zone_distribution_pct": [50, 50]},
      "wind":  {"blocks": 15, "zone_distribution_pct": [50, 50]},
      "gas":   {"blocks": 30, "zone_distribution_pct": [50, 50]},
      "coal":  {"blocks": 20, "zone_distribution_pct": [50, 50]}
    }
  },
  "devices": [
    {
      "id": "device_coal_001", "type": "coal", "name": "Coal Plant A",
      "player_id": 1, "zone": 1, "capacity_mw": 600,
      "variable_cost_tiers": [
        {"from_pct": 0,  "to_pct": 60,  "cost_zar_per_mwh": 380},
        {"from_pct": 60, "to_pct": 100, "cost_zar_per_mwh": 480}
      ],
      "efficiency_pct": 35, "ramp_rate_mw_per_h": 120
    }
  ],
  "events": [
    {
      "id": "event_peak_001", "type": "demand_surge", "name": "Evening Peak",
      "trigger": {"type": "round", "value": 3},
      "multiplier": 1.15, "additive": 0, "duration_rounds": 1, "target": "demand"
    }
  ],
  "challenges": [],
  "scoring": {"weights": {"profit": 0.6, "imbalance": 0.3, "curtailment": 0.1}}
}
```

## Device types

| Type             | Required fields                   | Optional fields                   |
|------------------|-----------------------------------|-----------------------------------|
| coal / gas       | capacity_mw, variable_cost_tiers  | efficiency_pct, ramp_rate_mw_per_h |
| hydro / nuclear  | capacity_mw, cost_per_mwh_zar    | efficiency_pct, ramp_rate_mw_per_h |
| solar / wind     | capacity_mw, cost_per_mwh_zar    | capacity_factor_pct               |
| battery          | capacity_mw, power_rating_mw     | efficiency_pct, initial_soc_pct   |
| industrial/commercial/residential_load | baseline_load_mw, peak_load_mw | drm_capable |

Device ID format: `device_<type>_<3-digit>` e.g. `device_wind_003`

## Event types

| type            | Key fields                                          |
|-----------------|-----------------------------------------------------|
| demand_surge    | multiplier on demand, duration_rounds               |
| outage          | target_device_id, duration_rounds                  |
| price_spike     | new_price_cap, duration_rounds                     |
| renewable_boost | multiplier on renewables                           |

## Clearing types

- `uniform` — all accepted generators receive the marginal clearing price (MCP)
- `pay_as_bid` — each generator is paid its own bid price

## Rules

- Do NOT invent fields not in the schema above.
- Always produce the COMPLETE config (not just the changed section).
- Device IDs must be unique within a scenario.
- If a scenario context is provided, base your response on it.
"""

QA_SYSTEM_PROMPT = """\
You are an expert AI assistant for the Electricity Market Simulation Game (EMSG/KSE).
You answer user questions about the currently visible page context, such as briefing, round results,
scenario results, or the home dashboard.

## Your behaviour

- Always respond in plain English.
- This is a question-answer assistant only. Never propose scenario edits and never emit hidden JSON blocks.
- Base your answer on the provided page context. If the context is missing a needed detail, say that clearly.
- Do not invent numbers, rankings, events, formulas, or configuration values.
- When the question asks how calculations work, use the provided source code reference when available.
- Keep answers concise, practical, and grounded in the current page.
"""

# ─── Provider logic ───────────────────────────────────────────────────────────

def _call_groq(messages: list, model: str, api_key: str) -> str:
    from groq import Groq
    client = Groq(api_key=api_key)
    resp = client.chat.completions.create(
        model=model, messages=messages, temperature=0.7, max_tokens=4096,
    )
    return resp.choices[0].message.content or ""


def _call_gemini(messages: list, model: str, api_key: str) -> str:
    from google import genai
    from google.genai import types as gtypes
    client = genai.Client(api_key=api_key)
    system_parts, chat_msgs = [], []
    for m in messages:
        if m["role"] == "system":
            system_parts.append(gtypes.Part.from_text(text=m["content"]))
        else:
            chat_msgs.append(m)
    history = [
        gtypes.Content(
            role="user" if m["role"] == "user" else "model",
            parts=[gtypes.Part.from_text(text=m["content"])],
        )
        for m in chat_msgs[:-1]
    ]
    cfg = gtypes.GenerateContentConfig(
        system_instruction=gtypes.Content(parts=system_parts) if system_parts else None,
        temperature=0.7, max_output_tokens=4096,
    )
    chat = client.chats.create(model=model, history=history, config=cfg)
    resp = chat.send_message(chat_msgs[-1]["content"] if chat_msgs else "")
    return resp.text or ""


def _call_openai(messages: list, model: str, api_key: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model=model, messages=messages, temperature=0.7, max_tokens=4096,
    )
    return resp.choices[0].message.content or ""


def _llm_call(messages: list) -> tuple[str, str, str]:
    """Dispatch to configured provider with automatic fallback chain.
    Returns (reply, provider, model). Raises RuntimeError if all fail.
    """
    PROVIDER_DEFAULTS = {
        "groq":   [
            ("GROQ_API_KEY",   "llama-3.3-70b-versatile"),
            ("GROQ_API_KEY_2", "llama-3.3-70b-versatile"),
        ],
        "gemini": [
            ("GEMINI_API_KEY",   "gemini-2.0-flash"),
            ("GEMINI_API_KEY_2", "gemini-2.0-flash"),
        ],
        "openai": [
            ("OPENAI_API_KEY", "gpt-4o-mini"),
        ],
    }
    CALLERS = {
        "groq":   _call_groq,
        "gemini": _call_gemini,
        "openai": _call_openai,
    }

    primary = os.getenv("KSECHAT_PROVIDER", "groq").lower()
    fallbacks_raw = os.getenv("KSECHAT_FALLBACK_PROVIDERS", "").strip()
    fallback_providers = [p.strip().lower() for p in fallbacks_raw.split(",") if p.strip()]

    # Build ordered list of (provider, key_env, model) attempts
    attempts = []
    primary_model = os.getenv("KSECHAT_MODEL", "")
    for provider in [primary] + fallback_providers:
        if provider not in PROVIDER_DEFAULTS:
            continue
        for key_env, default_model in PROVIDER_DEFAULTS[provider]:
            api_key = os.getenv(key_env, "").strip()
            if api_key:
                model = primary_model if provider == primary and primary_model else default_model
                attempts.append((provider, api_key, model))

    if not attempts:
        raise RuntimeError("No API keys configured for any provider.")

    last_exc = None
    for provider, api_key, model in attempts:
        try:
            reply = CALLERS[provider](messages, model, api_key)
            return reply, provider, model
        except Exception as exc:
            last_exc = exc
            # Continue to next key/provider on any error (rate limit, quota, auth, …)
            continue

    raise RuntimeError(f"All providers failed. Last error: {last_exc}")


# ─── JSON extraction & reply cleaning ────────────────────────────────────────

_MARKER_RE = re.compile(
    r"<!--\s*SCENARIO_JSON_START\s*-->\s*```json\s*([\s\S]*?)```\s*<!--\s*SCENARIO_JSON_END\s*-->",
    re.IGNORECASE,
)
_LOOSE_JSON_RE = re.compile(r"```json\s*([\s\S]*?)```", re.IGNORECASE)


def _extract_and_strip(text: str) -> tuple[dict | None, str]:
    """Extract scenario JSON and return (json_obj, clean_reply_without_json_blocks)."""
    scenario_json = None

    # Try marker-delimited block first (preferred)
    m = _MARKER_RE.search(text)
    if m:
        try:
            data = json.loads(m.group(1).strip())
            if isinstance(data, dict):
                scenario_json = data
        except (json.JSONDecodeError, ValueError):
            pass
        text = _MARKER_RE.sub("", text).strip()

    # Fall back to bare ```json``` block if no marker found
    if scenario_json is None:
        for raw in _LOOSE_JSON_RE.findall(text):
            try:
                data = json.loads(raw.strip())
                if isinstance(data, dict):
                    scenario_json = data
                    break
            except (json.JSONDecodeError, ValueError):
                continue
        if scenario_json is not None:
            # Strip all json code blocks from visible reply
            text = _LOOSE_JSON_RE.sub("", text).strip()

    return scenario_json, text


def _render_context_block(label: str, context) -> str:
    """Render page context into the prompt in a compact JSON block."""
    if context is None:
        return ""
    try:
        rendered = json.dumps(context, indent=2, ensure_ascii=False)
    except (TypeError, ValueError):
        rendered = json.dumps(str(context), ensure_ascii=False)
    if len(rendered) > 30000:
        rendered = rendered[:30000] + "\n... [truncated]"
    return (
        f"\n\n---\n## {label or 'Current page context'}\n"
        f"```json\n{rendered}\n```\n"
    )


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@ns.route("/chat")
class KSEChatResource(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(chat_in)
    @ns.marshal_with(chat_out)
    def post(self):
        """Chat with LLM for scenario creation/editing"""
        data = request.json or {}
        messages = data.get("messages", [])
        scenario_id = data.get("scenario_id")
        scenario_context = data.get("scenario_context")

        # Load scenario context from DB
        if scenario_id and not scenario_context:
            sc = Scenario.query.get(scenario_id)
            if sc and sc.config:
                scenario_context = sc.config

        # Build system prompt: schema + optional code reference + optional scenario context
        system_content = SYSTEM_PROMPT
        if _needs_code_context(messages):
            system_content += (
                "\n\n---\n## Source code reference (for answering calculation questions)\n\n"
                + _load_code_context()
            )
        if scenario_context:
            system_content += (
                "\n\n---\n## Current scenario (base for your changes)\n"
                "```json\n"
                + json.dumps(scenario_context, indent=2, ensure_ascii=False)
                + "\n```\n"
            )

        llm_messages = [{"role": "system", "content": system_content}] + [
            {"role": m.get("role", "user"), "content": str(m.get("content", ""))}
            for m in messages
            if isinstance(m, dict) and m.get("content")
        ]

        try:
            reply_text, provider, model = _llm_call(llm_messages)
        except (RuntimeError, ValueError) as exc:
            return {"reply": f"⚠️ {exc}", "scenario_json": None, "provider": "", "model": ""}, 200
        except ImportError as exc:
            return {"reply": f"⚠️ Missing package: {exc}.", "scenario_json": None, "provider": "", "model": ""}, 200
        except Exception as exc:
            return {"reply": f"⚠️ LLM error: {exc}", "scenario_json": None, "provider": "", "model": ""}, 200

        scenario_json, clean_reply = _extract_and_strip(reply_text)
        return {
            "reply": clean_reply,
            "scenario_json": scenario_json,
            "provider": provider,
            "model": model,
        }


@ns.route("/qa")
class KSEQuestionAnswerResource(Resource):
    @jwt_required()
    @role_required("player", "trainer", "designer", "admin")
    @ns.expect(qa_in)
    @ns.marshal_with(qa_out)
    def post(self):
        """Chat with LLM for question-answer help on contextual app pages."""
        data = request.json or {}
        messages = data.get("messages", [])
        context_label = str(data.get("context_label") or "Current page context").strip()
        context = data.get("context")

        system_content = QA_SYSTEM_PROMPT
        if _needs_code_context(messages):
            system_content += (
                "\n\n---\n## Source code reference (for answering calculation questions)\n\n"
                + _load_code_context()
            )
        system_content += _render_context_block(context_label, context)

        llm_messages = [{"role": "system", "content": system_content}] + [
            {"role": m.get("role", "user"), "content": str(m.get("content", ""))}
            for m in messages
            if isinstance(m, dict) and m.get("content")
        ]

        try:
            reply_text, provider, model = _llm_call(llm_messages)
        except (RuntimeError, ValueError) as exc:
            return {"reply": f"⚠️ {exc}", "provider": "", "model": ""}, 200
        except ImportError as exc:
            return {"reply": f"⚠️ Missing package: {exc}.", "provider": "", "model": ""}, 200
        except Exception as exc:
            return {"reply": f"⚠️ LLM error: {exc}", "provider": "", "model": ""}, 200

        _, clean_reply = _extract_and_strip(reply_text)
        return {
            "reply": clean_reply,
            "provider": provider,
            "model": model,
        }


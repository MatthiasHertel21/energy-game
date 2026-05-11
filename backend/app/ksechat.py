"""
KSE Chat – LLM-gestützte Szenarienerstellung für Designer
Heimlicher Zugang über /ksechat (nur designer + admin)

Unterstützte Provider (via KSECHAT_PROVIDER):
  groq   – Groq Cloud API (llama-3.3-70b-versatile, mixtral-8x7b-32768, …)
  gemini – Google Gemini API (gemini-1.5-flash, gemini-1.5-pro, …)
  openai – OpenAI API (gpt-4o-mini, gpt-4o, …)
"""
import json
import os
import re

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required

from .utils import role_required
from .models import Scenario

ns = Namespace("ksechat", description="KSE Chat – LLM-gestützte Szenarienerstellung")

# ─── API-Modelle ──────────────────────────────────────────────────────────────

chat_in = ns.model(
    "KSEChatIn",
    {
        "messages": fields.List(
            fields.Raw, required=True,
            description="Gesprächsverlauf [{role, content}]"
        ),
        "scenario_id": fields.Integer(
            required=False,
            description="Optional: bestehende Szenario-ID als Kontext laden"
        ),
        "scenario_context": fields.Raw(
            required=False,
            description="Optional: Szenario-Config direkt mitgeben"
        ),
    },
)

chat_out = ns.model(
    "KSEChatOut",
    {
        "reply": fields.String(description="Antworttext des LLM"),
        "scenario_json": fields.Raw(description="Extrahiertes Szenario-JSON, falls vorhanden"),
        "provider": fields.String(description="Genutzter LLM-Provider"),
        "model": fields.String(description="Genutztes Modell"),
    },
)

# ─── System-Prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an AI assistant for the Electricity Market Simulation Game (EMSG/KSE).
Your role is to help designers create and edit game scenarios.

## Game concept

The EMSG is an energy market simulation game. Players act as electricity generating companies
that submit bids in a Day-Ahead market over multiple rounds. A scenario defines:
- Market parameters (prices, capacities, clearing type)
- Grid structure (zones, ATC values, losses)
- Player devices (generators controlled by players)
- Environment generators (not controlled by players)
- Events (demand_surge, outage, price_spike, …)
- Challenges (optional learning tasks)

## Full scenario config structure

```json
{
  "general": {
    "horizon_hours": 24,
    "forecast_horizon_hours": 48,
    "rounds": 4,
    "round_span_hours": 6,
    "round_duration_seconds": 300,
    "player_zone": 1,
    "fake_date": "2024-06-15",
    "start_time": "00:00"
  },
  "market": {
    "base_price": 1000,
    "base_volume_mwh": 20000,
    "price_floor": -500,
    "price_cap": 5000,
    "clearing_type": "uniform",
    "generator_mix": {
      "coal":    {"blocks": 20, "zone_distribution_pct": [50, 50]},
      "gas":     {"blocks": 30, "zone_distribution_pct": [50, 50]},
      "solar":   {"blocks": 20, "zone_distribution_pct": [50, 50]},
      "wind":    {"blocks": 15, "zone_distribution_pct": [50, 50]},
      "hydro":   {"blocks": 10, "zone_distribution_pct": [50, 50]},
      "nuclear": {"blocks":  5, "zone_distribution_pct": [50, 50]}
    }
  },
  "balancing": {
    "up_price_zar_per_mwh": 1200.0,
    "down_price_zar_per_mwh": 800.0
  },
  "grid": {
    "zones": 2,
    "atc": [[0, 5000], [5000, 0]],
    "losses_pct_per_link": 2.0,
    "network_settlement": {
      "extra_cost_mode": "zonal_only",
      "cost_allocation_target": "consumers_only",
      "shortfall_price_mode": "smp_multiplier",
      "shortfall_price_value": 2.0
    },
    "generator_curtailment_mode": "pro_rata"
  },
  "environment": {
    "seed": "my-seed-2024",
    "groups": {
      "solar":   {"blocks": 20, "zone_distribution_pct": [50, 50]},
      "wind":    {"blocks": 15, "zone_distribution_pct": [50, 50]},
      "gas":     {"blocks": 30, "zone_distribution_pct": [50, 50]},
      "coal":    {"blocks": 20, "zone_distribution_pct": [50, 50]},
      "hydro":   {"blocks": 10, "zone_distribution_pct": [50, 50]},
      "nuclear": {"blocks":  5, "zone_distribution_pct": [50, 50]}
    }
  },
  "devices": [
    {
      "id": "device_coal_001",
      "type": "coal",
      "name": "Coal Plant A",
      "player_id": 1,
      "zone": 1,
      "capacity_mw": 600,
      "variable_cost_tiers": [
        {"from_pct": 0,  "to_pct": 60,  "cost_zar_per_mwh": 380},
        {"from_pct": 60, "to_pct": 90,  "cost_zar_per_mwh": 440},
        {"from_pct": 90, "to_pct": 100, "cost_zar_per_mwh": 520}
      ],
      "fixed_cost_zar_per_hour": 0,
      "efficiency_pct": 35,
      "ramp_rate_mw_per_h": 120
    },
    {
      "id": "device_solar_001",
      "type": "solar",
      "name": "Solar Farm B",
      "player_id": 2,
      "zone": 2,
      "capacity_mw": 200,
      "cost_per_mwh_zar": 50,
      "capacity_factor_pct": 25
    }
  ],
  "events": [
    {
      "id": "event_evening_peak",
      "type": "demand_surge",
      "name": "Evening Peak",
      "trigger": {"type": "round", "value": 3},
      "multiplier": 1.15,
      "additive": 0,
      "duration_rounds": 1,
      "target": "demand"
    }
  ],
  "challenges": [],
  "scoring": {
    "weights": {"profit": 0.6, "imbalance": 0.3, "curtailment": 0.1}
  }
}
```

## Device types

| Type             | Required fields                  | Optional fields                        |
|------------------|----------------------------------|----------------------------------------|
| coal             | capacity_mw, variable_cost_tiers | efficiency_pct, ramp_rate_mw_per_h     |
| gas              | capacity_mw, variable_cost_tiers | efficiency_pct, ramp_rate_mw_per_h     |
| hydro            | capacity_mw, cost_per_mwh_zar   | efficiency_pct, ramp_rate_mw_per_h     |
| nuclear          | capacity_mw, cost_per_mwh_zar   | efficiency_pct, ramp_rate_mw_per_h     |
| solar            | capacity_mw, cost_per_mwh_zar   | capacity_factor_pct                    |
| wind             | capacity_mw, cost_per_mwh_zar   | capacity_factor_pct                    |
| battery          | capacity_mw, power_rating_mw    | efficiency_pct, initial_soc_pct        |
| industrial_load  | baseline_load_mw, peak_load_mw  | drm_capable                            |
| commercial_load  | baseline_load_mw, peak_load_mw  | drm_capable                            |
| residential_load | baseline_load_mw, peak_load_mw  | drm_capable                            |

## Event types

| type            | Description                                              |
|-----------------|----------------------------------------------------------|
| demand_surge    | Demand rises (multiplier on base demand)                 |
| outage          | A device goes offline for duration_rounds rounds         |
| price_spike     | Market price cap is temporarily raised                   |
| renewable_boost | Renewables produce more (multiplier)                     |

## Rules

- Always respond in English.
- When generating JSON, ALWAYS wrap it in ```json ... ``` code blocks.
- If the user gives a modification instruction ("Add X", "Change Y"), ALWAYS return the complete, modified config.
- Device ID format: "device_<type>_<3-digit-number>", e.g. "device_coal_001".
- Do not invent fields that are not in the schema.
- If a scenario context is provided, use it as the base for your response.
"""

# ─── Provider-Logik ──────────────────────────────────────────────────────────

def _call_groq(messages: list, model: str, api_key: str) -> str:
    from groq import Groq
    client = Groq(api_key=api_key)
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.7,
        max_tokens=4096,
    )
    return resp.choices[0].message.content or ""


def _call_gemini(messages: list, model: str, api_key: str) -> str:
    # Nutzt das neue google-genai SDK (>= 1.0) mit OpenAI-kompatiblem Endpunkt
    from google import genai
    from google.genai import types as gtypes

    client = genai.Client(api_key=api_key)

    # System-Nachricht extrahieren
    system_parts = []
    chat_msgs = []
    for m in messages:
        if m["role"] == "system":
            system_parts.append(gtypes.Part.from_text(text=m["content"]))
        else:
            chat_msgs.append(m)

    # Verlauf aufbauen (alle außer letzter Nachricht)
    history = []
    for m in chat_msgs[:-1]:
        history.append(gtypes.Content(
            role="user" if m["role"] == "user" else "model",
            parts=[gtypes.Part.from_text(text=m["content"])],
        ))

    config = gtypes.GenerateContentConfig(
        system_instruction=gtypes.Content(parts=system_parts) if system_parts else None,
        temperature=0.7,
        max_output_tokens=4096,
    )

    chat = client.chats.create(model=model, history=history, config=config)
    last_content = chat_msgs[-1]["content"] if chat_msgs else ""
    resp = chat.send_message(last_content)
    return resp.text or ""


def _call_openai(messages: list, model: str, api_key: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.7,
        max_tokens=4096,
    )
    return resp.choices[0].message.content or ""


def _llm_call(messages: list) -> tuple[str, str, str]:
    """Ruft den konfigurierten Provider auf. Gibt (reply_text, provider, model) zurueck."""
    provider = os.getenv("KSECHAT_PROVIDER", "groq").lower()

    defaults = {
        "groq":   ("GROQ_API_KEY",   "llama-3.3-70b-versatile"),
        "gemini": ("GEMINI_API_KEY",  "gemini-2.0-flash"),
        "openai": ("OPENAI_API_KEY",  "gpt-4o-mini"),
    }

    if provider not in defaults:
        raise ValueError(f"Unbekannter Provider: {provider}. Erlaubt: {list(defaults)}")

    key_env, default_model = defaults[provider]
    api_key = os.getenv(key_env, "").strip()
    model = os.getenv("KSECHAT_MODEL", default_model)

    if not api_key:
        raise RuntimeError(
            f"Kein API-Key fuer Provider '{provider}' konfiguriert. "
            f"Bitte {key_env} in der .env-Datei setzen."
        )

    if provider == "groq":
        reply = _call_groq(messages, model, api_key)
    elif provider == "gemini":
        reply = _call_gemini(messages, model, api_key)
    else:
        reply = _call_openai(messages, model, api_key)

    return reply, provider, model


# ─── JSON-Extraktion ─────────────────────────────────────────────────────────

def _extract_scenario_json(text: str):
    for raw in re.findall(r"```json\s*([\s\S]*?)```", text, re.IGNORECASE):
        try:
            data = json.loads(raw.strip())
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, ValueError):
            continue
    return None


# ─── Endpunkt ────────────────────────────────────────────────────────────────

@ns.route("/chat")
class KSEChatResource(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(chat_in)
    @ns.marshal_with(chat_out)
    def post(self):
        """Chat mit LLM zur Szenarioerstellung/-bearbeitung"""
        data = request.json or {}
        messages = data.get("messages", [])
        scenario_id = data.get("scenario_id")
        scenario_context = data.get("scenario_context")

        # Szenario-Kontext aus DB laden
        if scenario_id and not scenario_context:
            sc = Scenario.query.get(scenario_id)
            if sc and sc.config:
                scenario_context = sc.config

        # System-Prompt aufbauen
        system_content = SYSTEM_PROMPT
        if scenario_context:
            system_content += (
                "\n\n## Current scenario context (use this as the base for your response)\n"
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
            return {
                "reply": f"⚠️ Benoetiges Paket nicht installiert: {exc}.",
                "scenario_json": None, "provider": "", "model": "",
            }, 200
        except Exception as exc:
            return {"reply": f"⚠️ LLM-Fehler: {exc}", "scenario_json": None, "provider": "", "model": ""}, 200

        scenario_json = _extract_scenario_json(reply_text)
        return {
            "reply": reply_text,
            "scenario_json": scenario_json,
            "provider": provider,
            "model": model,
        }

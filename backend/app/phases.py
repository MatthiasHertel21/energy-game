"""Two-phase round helpers.

A "two-phase round" runs the DAM market phase first and the IDM market phase
second, both under the *same* ``round_num``. The feature is purely additive and
default OFF: when ``general.two_phase_rounds`` is absent / empty / false for a
round, every helper here degrades to the legacy single-phase behaviour so that
existing scenarios (including those without IDM) run byte-for-byte unchanged.

Phase vocabulary (string constants used across engine / scheduler / sessions /
player and persisted on ``Forecast.market_phase`` / ``Session.market_phase``):

- ``"single"``  : legacy single-phase round (one clearing, one Result).
- ``"dam"``     : the DAM clearing phase of a two-phase round (provisional).
- ``"idm"``     : the IDM clearing phase of a two-phase round (final Result).
"""

from __future__ import annotations

from typing import Any

PHASE_SINGLE = "single"
PHASE_DAM = "dam"
PHASE_IDM = "idm"

VALID_PHASES = (PHASE_SINGLE, PHASE_DAM, PHASE_IDM)


def normalize_round_phase(value: Any) -> str:
    """Coerce an arbitrary value into one of the valid phase strings.

    Unknown / missing values normalize to ``"single"`` (legacy behaviour).
    """
    if value is None:
        return PHASE_SINGLE
    text = str(value).strip().lower()
    if text in VALID_PHASES:
        return text
    return PHASE_SINGLE


def _market_trading_status(config: dict, market_key: str, round_num: int) -> str:
    """Return the configured trading status ('on'/'market_code'/'off') for a market+round.

    Mirrors ``sessions._get_market_status_for_round`` but kept dependency-free so
    this module can be imported anywhere without circular imports.
    """
    markets_cfg = (config or {}).get("markets", {}) if isinstance(config, dict) else {}
    round_idx = max(0, int(round_num or 1) - 1)
    market_data = markets_cfg.get(market_key, []) if isinstance(markets_cfg, dict) else []

    if isinstance(market_data, list):
        return market_data[round_idx] if round_idx < len(market_data) else "market_code"
    if isinstance(market_data, dict):
        trading_array = market_data.get("trading", [])
        if isinstance(trading_array, list):
            return trading_array[round_idx] if round_idx < len(trading_array) else "market_code"
    return "market_code"


def get_two_phase_rounds(config: dict) -> list[bool]:
    """Return the raw ``general.two_phase_rounds`` flags as a list of booleans."""
    general = (config or {}).get("general", {}) if isinstance(config, dict) else {}
    raw = general.get("two_phase_rounds", []) if isinstance(general, dict) else []
    if not isinstance(raw, list):
        return []
    return [bool(x) for x in raw]


def is_two_phase_round(config: dict, round_num: int) -> bool:
    """True only when the round is explicitly flagged two-phase AND eligible.

    Eligibility requires both DAM and IDM trading set to Enabled ('on') for the
    round, matching the KSE UI constraint. Any inconsistency degrades to False
    (legacy single-phase), so a stale flag can never silently change behaviour.
    """
    flags = get_two_phase_rounds(config)
    idx = max(0, int(round_num or 1) - 1)
    if idx >= len(flags) or not flags[idx]:
        return False
    dam_status = _market_trading_status(config, "dam", round_num)
    idm_status = _market_trading_status(config, "idm", round_num)
    return dam_status == "on" and idm_status == "on"


def phase_sequence_for_round(config: dict, round_num: int) -> list[str]:
    """Return the ordered list of execution phases for a round.

    - Two-phase round  -> ``["dam", "idm"]``
    - Otherwise        -> ``["single"]`` (legacy)
    """
    if is_two_phase_round(config, round_num):
        return [PHASE_DAM, PHASE_IDM]
    return [PHASE_SINGLE]


def is_final_phase(config: dict, round_num: int, phase: Any) -> bool:
    """True when ``phase`` is the phase that produces the final Result for the round."""
    seq = phase_sequence_for_round(config, round_num)
    return normalize_round_phase(phase) == seq[-1]


def next_phase(config: dict, round_num: int, phase: Any) -> str | None:
    """Return the phase following ``phase`` within the same round, or None if last."""
    seq = phase_sequence_for_round(config, round_num)
    current = normalize_round_phase(phase)
    if current not in seq:
        return None
    pos = seq.index(current)
    if pos + 1 < len(seq):
        return seq[pos + 1]
    return None

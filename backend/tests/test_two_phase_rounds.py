"""
QS: Zwei-Phasen-Runden (DAM-Phase dann IDM-Phase unter demselben round_num)
===========================================================================

Diese Tests prüfen die dependency-freie Kernlogik des Features (``app.phases``)
sowie die Reduktion der neuen Engine-/Scheduler-Schalter auf das Legacy-Verhalten,
wenn das Feature AUS ist (Backward-Compatibility-Regressionsnachweis).

Designregeln (vom Anwender bestätigt 2026-06-04):
1. Events wirken nur in der IDM-Phase (DAM-Phase eventfrei).
2. Gemeinsames SoC-Budget über beide Phasen einer Runde.
3. Runde-1-Zwei-Phasen braucht keine Tag-1-Sonderregel.

Backward-Compat: Szenarien ohne ``two_phase_rounds`` und Szenarien ohne IDM
müssen byte-fuer-byte unveraendert laufen (Legacy-Pfad, kein PhaseResult).
"""

import pytest

from app.phases import (
    PHASE_SINGLE,
    PHASE_DAM,
    PHASE_IDM,
    normalize_round_phase,
    get_two_phase_rounds,
    is_two_phase_round,
    phase_sequence_for_round,
    is_final_phase,
    next_phase,
)


# ─────────────────────────────────────────────────────────────────────────────
# Konfig-Helfer
# ─────────────────────────────────────────────────────────────────────────────

def _cfg(two_phase=None, dam=None, idm=None):
    """Baue eine minimale Szenario-Konfig mit markets.trading-Arrays."""
    general = {}
    if two_phase is not None:
        general["two_phase_rounds"] = two_phase
    markets = {}
    if dam is not None:
        markets["dam"] = {"trading": dam}
    if idm is not None:
        markets["idm"] = {"trading": idm}
    return {"general": general, "markets": markets}


# ─────────────────────────────────────────────────────────────────────────────
# 1. normalize_round_phase
# ─────────────────────────────────────────────────────────────────────────────

class TestNormalizeRoundPhase:
    def test_known_phases_passthrough(self):
        assert normalize_round_phase("single") == PHASE_SINGLE
        assert normalize_round_phase("dam") == PHASE_DAM
        assert normalize_round_phase("idm") == PHASE_IDM

    def test_case_and_whitespace_insensitive(self):
        assert normalize_round_phase("  DAM ") == PHASE_DAM
        assert normalize_round_phase("Idm") == PHASE_IDM

    def test_unknown_and_none_default_to_single(self):
        assert normalize_round_phase(None) == PHASE_SINGLE
        assert normalize_round_phase("") == PHASE_SINGLE
        assert normalize_round_phase("garbage") == PHASE_SINGLE
        assert normalize_round_phase(123) == PHASE_SINGLE


# ─────────────────────────────────────────────────────────────────────────────
# 2. get_two_phase_rounds
# ─────────────────────────────────────────────────────────────────────────────

class TestGetTwoPhaseRounds:
    def test_absent_returns_empty(self):
        assert get_two_phase_rounds({}) == []
        assert get_two_phase_rounds({"general": {}}) == []

    def test_coerces_to_bool(self):
        assert get_two_phase_rounds(_cfg(two_phase=[1, 0, True, False])) == [True, False, True, False]

    def test_non_list_returns_empty(self):
        assert get_two_phase_rounds({"general": {"two_phase_rounds": "x"}}) == []


# ─────────────────────────────────────────────────────────────────────────────
# 3. is_two_phase_round – Eligibility (DAM+IDM beide 'on')
# ─────────────────────────────────────────────────────────────────────────────

class TestIsTwoPhaseRound:
    def test_flag_set_and_both_on_is_two_phase(self):
        cfg = _cfg(two_phase=[True], dam=["on"], idm=["on"])
        assert is_two_phase_round(cfg, 1) is True

    def test_flag_set_but_dam_not_on_is_single(self):
        cfg = _cfg(two_phase=[True], dam=["market_code"], idm=["on"])
        assert is_two_phase_round(cfg, 1) is False

    def test_flag_set_but_idm_off_is_single(self):
        cfg = _cfg(two_phase=[True], dam=["on"], idm=["off"])
        assert is_two_phase_round(cfg, 1) is False

    def test_flag_not_set_is_single(self):
        cfg = _cfg(two_phase=[False], dam=["on"], idm=["on"])
        assert is_two_phase_round(cfg, 1) is False

    def test_round_index_out_of_range_is_single(self):
        cfg = _cfg(two_phase=[True], dam=["on"], idm=["on"])
        assert is_two_phase_round(cfg, 5) is False

    def test_legacy_scenario_without_flag_is_single(self):
        # No two_phase_rounds key at all – pure legacy scenario.
        cfg = _cfg(dam=["on"], idm=["on"])
        assert is_two_phase_round(cfg, 1) is False

    def test_round1_two_phase_supported(self):
        # Rule 3: round 1 may be two-phase (no Tag-1 special rule needed).
        cfg = _cfg(two_phase=[True, True], dam=["on", "on"], idm=["on", "on"])
        assert is_two_phase_round(cfg, 1) is True
        assert is_two_phase_round(cfg, 2) is True


# ─────────────────────────────────────────────────────────────────────────────
# 4. phase_sequence_for_round / is_final_phase / next_phase
# ─────────────────────────────────────────────────────────────────────────────

class TestPhaseSequence:
    def test_two_phase_sequence(self):
        cfg = _cfg(two_phase=[True], dam=["on"], idm=["on"])
        assert phase_sequence_for_round(cfg, 1) == [PHASE_DAM, PHASE_IDM]

    def test_single_phase_sequence(self):
        cfg = _cfg(two_phase=[False], dam=["on"], idm=["on"])
        assert phase_sequence_for_round(cfg, 1) == [PHASE_SINGLE]

    def test_final_phase_two_phase_is_idm(self):
        cfg = _cfg(two_phase=[True], dam=["on"], idm=["on"])
        assert is_final_phase(cfg, 1, PHASE_IDM) is True
        assert is_final_phase(cfg, 1, PHASE_DAM) is False

    def test_final_phase_single_is_single(self):
        cfg = _cfg(two_phase=[False], dam=["on"], idm=["on"])
        assert is_final_phase(cfg, 1, PHASE_SINGLE) is True

    def test_next_phase_dam_to_idm(self):
        cfg = _cfg(two_phase=[True], dam=["on"], idm=["on"])
        assert next_phase(cfg, 1, PHASE_DAM) == PHASE_IDM
        assert next_phase(cfg, 1, PHASE_IDM) is None

    def test_next_phase_single_is_none(self):
        cfg = _cfg(two_phase=[False], dam=["on"], idm=["on"])
        assert next_phase(cfg, 1, PHASE_SINGLE) is None


# ─────────────────────────────────────────────────────────────────────────────
# 5. Engine-Schalter-Reduktion: emit_idm_settlement == Legacy bei single-phase
# ─────────────────────────────────────────────────────────────────────────────

def _emit_idm_settlement(id_delta_round: bool, round_num: int, is_idm_phase: bool) -> bool:
    """Replika des Engine-Schalters (engine.run_round)."""
    return id_delta_round and (round_num > 1 or is_idm_phase)


class TestEmitIdmSettlementReduction:
    """Beweist: bei single-phase (is_idm_phase=False) == Legacy `round_num>1 and id_delta_round`."""

    @pytest.mark.parametrize("round_num", [1, 2, 3, 4])
    @pytest.mark.parametrize("id_delta_round", [True, False])
    def test_single_phase_reduces_to_legacy(self, round_num, id_delta_round):
        legacy = (round_num > 1) and id_delta_round
        assert _emit_idm_settlement(id_delta_round, round_num, is_idm_phase=False) == legacy

    def test_idm_phase_round1_emits_settlement(self):
        # Two-phase round 1 IDM phase MUST settle (legacy would not for round 1).
        assert _emit_idm_settlement(id_delta_round=True, round_num=1, is_idm_phase=True) is True

    def test_dam_phase_never_emits_settlement(self):
        # DAM phase forces id_delta_round=False -> no IDM settlement.
        assert _emit_idm_settlement(id_delta_round=False, round_num=1, is_idm_phase=False) is False


# ─────────────────────────────────────────────────────────────────────────────
# 6. Events nur in der IDM-Phase (Regel 1)
# ─────────────────────────────────────────────────────────────────────────────

def _round_events(is_dam_phase: bool, selected_events: list) -> list:
    """Replika der Engine-Eventauswahl: DAM-Phase ist eventfrei."""
    if is_dam_phase:
        return []
    return selected_events


class TestEventsOnlyInIdm:
    def test_dam_phase_suppresses_events(self):
        assert _round_events(is_dam_phase=True, selected_events=[{"id": "e1"}]) == []

    def test_idm_phase_keeps_events(self):
        evts = [{"id": "e1"}, {"id": "e2"}]
        assert _round_events(is_dam_phase=False, selected_events=evts) == evts

    def test_single_phase_keeps_events(self):
        evts = [{"id": "e1"}]
        assert _round_events(is_dam_phase=False, selected_events=evts) == evts


# ─────────────────────────────────────────────────────────────────────────────
# 7. Gemeinsames SoC-Budget (Regel 2): IDM-Phase startet vom DAM-Endzustand
# ─────────────────────────────────────────────────────────────────────────────

def _seed_soc(is_idm_phase: bool, round_num: int, seed_state, legacy_state):
    """Replika der Engine-SoC-Quelle: IDM-Phase seeded vom DAM-Endzustand."""
    if is_idm_phase and isinstance(seed_state, dict) and seed_state:
        return seed_state
    if round_num > 1 and legacy_state:
        return legacy_state
    return None


class TestSharedSocBudget:
    def test_idm_phase_seeds_from_dam_end_state(self):
        dam_end = {"battery_1": {"soc_mwh": 12.5}}
        legacy = {"battery_1": {"soc_mwh": 99.0}}
        assert _seed_soc(True, 1, dam_end, legacy) == dam_end

    def test_single_phase_round1_no_seed(self):
        assert _seed_soc(False, 1, None, None) is None

    def test_single_phase_round2_uses_legacy_state(self):
        legacy = {"battery_1": {"soc_mwh": 7.0}}
        assert _seed_soc(False, 2, None, legacy) == legacy

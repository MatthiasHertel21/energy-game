"""
QS: Scheduler IDM-Delta-Bypass (fix: IDM=off → absolute forecast)
===================================================================

Testet die Logik, die bestimmt ob der IDM-Delta auf den Forecast angewandt
wird oder ob die absoluten Werte unverändert durchgereicht werden.

Fix in: backend/app/scheduler.py (else-Branch, current > 1)

Kernregel:
- IDM=off  → use_idm_delta=False  → Forecast-Stunden unverändert an Engine
- IDM=on   → use_idm_delta=True   → Stunden[start:end] = current[i] - da[i]
"""

import pytest
import copy


# ─────────────────────────────────────────────────────────────────────────────
# Replika der Scheduler-Logik (exakt wie scheduler.py, else-Branch)
# ─────────────────────────────────────────────────────────────────────────────

def _get_idm_status(cfg: dict, current_round: int) -> str:
    """Gibt den IDM-Status für die aktuelle Runde zurück (wie scheduler.py)."""
    markets_cfg = cfg.get("markets", {})
    idm_data = markets_cfg.get("idm", [])
    round_idx = current_round - 1
    if isinstance(idm_data, list):
        return idm_data[round_idx] if round_idx < len(idm_data) else "market_code"
    elif isinstance(idm_data, dict):
        trading_arr = idm_data.get("trading", [])
        return trading_arr[round_idx] if round_idx < len(trading_arr) else "market_code"
    return "market_code"


def apply_scheduler_delta(cfg: dict, current: int, hours_span: int,
                          forecasts: dict, da_snapshots: dict) -> dict:
    """
    Wendet (oder überspringt) den IDM-Delta an – exakt wie scheduler.py.
    Gibt die (ggf. modifizierten) forecasts zurück.
    """
    forecasts = copy.deepcopy(forecasts)

    idm_status = _get_idm_status(cfg, current)
    use_idm_delta = (idm_status != "off")

    if use_idm_delta:
        for pid, snap_hours in da_snapshots.items():
            da_hours = snap_hours
            start = (current - 1) * hours_span
            end = start + hours_span
            cur_entry = forecasts.get(pid, {'hours': [0.0] * len(da_hours), 'bids': None})
            cur_hours = cur_entry.get('hours', [])
            window = [
                (cur_hours[i] if i < len(cur_hours) else 0.0)
                - (da_hours[i] if i < len(da_hours) else 0.0)
                for i in range(start, end)
            ]
            merged = list(cur_hours)
            for off, i in enumerate(range(start, end)):
                if i < len(merged):
                    merged[i] = window[off]
            cur_entry = dict(cur_entry)
            cur_entry['hours'] = merged
            forecasts[pid] = cur_entry

    return forecasts, idm_status, use_idm_delta


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

HOURS_SPAN = 24        # 24 h pro Runde (DAM-Szenario)
HORIZON = 48           # 2-Tage-Horizont

# Spieler-Forecast aus Runde 1: kompletter 48h-Block
FORECAST_R1 = list(range(100, 148))   # Stunden 0..47 = 100..147 MW

# DA-Snapshot = Kopie des Runde-1-Forecasts
DA_SNAPSHOT = list(FORECAST_R1)


# ─────────────────────────────────────────────────────────────────────────────
# 1. IDM-Status-Erkennung
# ─────────────────────────────────────────────────────────────────────────────

class TestIdmStatusDetection:
    """Testet _get_idm_status für alle Konfigurationsformate."""

    def test_list_format_off(self):
        cfg = {"markets": {"idm": ["off", "off"]}}
        assert _get_idm_status(cfg, 2) == "off"

    def test_list_format_on(self):
        cfg = {"markets": {"idm": ["on", "on"]}}
        assert _get_idm_status(cfg, 2) == "on"

    def test_dict_trading_format_off(self):
        cfg = {"markets": {"idm": {"trading": ["off", "off"]}}}
        assert _get_idm_status(cfg, 2) == "off"

    def test_dict_trading_format_on(self):
        cfg = {"markets": {"idm": {"trading": ["on", "on"]}}}
        assert _get_idm_status(cfg, 2) == "on"

    def test_list_too_short_falls_back_to_market_code(self):
        cfg = {"markets": {"idm": ["on"]}}  # nur 1 Eintrag, Runde 2 fehlt
        assert _get_idm_status(cfg, 2) == "market_code"

    def test_missing_idm_key_falls_back_to_market_code(self):
        cfg = {"markets": {}}
        assert _get_idm_status(cfg, 2) == "market_code"

    def test_round_1_list_off(self):
        cfg = {"markets": {"idm": ["off", "off"]}}
        assert _get_idm_status(cfg, 1) == "off"


# ─────────────────────────────────────────────────────────────────────────────
# 2. DAM-only-Szenario: IDM=off → absoluter Forecast
# ─────────────────────────────────────────────────────────────────────────────

class TestIdmOffAbsoluteForecast:
    """
    DAM=on, IDM=off: Spieler reicht in Runde 1 einen 48h-Forecast ein.
    In Runde 2 darf der Scheduler die Stunden 24-47 NICHT durch einen Delta
    ersetzen – der Engine erhält die Original-Werte.
    """

    CFG_IDM_OFF = {"markets": {"idm": ["off", "off"]}}

    def test_round2_hours_24_47_unchanged(self):
        forecasts = {1: {'hours': list(FORECAST_R1), 'bids': None}}
        da_snapshots = {1: list(DA_SNAPSHOT)}

        result, status, used_delta = apply_scheduler_delta(
            self.CFG_IDM_OFF, current=2, hours_span=HOURS_SPAN,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        assert status == "off"
        assert used_delta is False
        out_hours = result[1]['hours']
        # Stunden 24-47 müssen unverändert sein
        assert out_hours[24:48] == FORECAST_R1[24:48], (
            "IDM=off: Stunden 24-47 dürfen NICHT durch Delta ersetzt werden"
        )

    def test_round2_hours_0_23_also_unchanged(self):
        """Auch Stunden 0-23 (bereits geliefert) bleiben unverändert."""
        forecasts = {1: {'hours': list(FORECAST_R1), 'bids': None}}
        da_snapshots = {1: list(DA_SNAPSHOT)}

        result, _, _ = apply_scheduler_delta(
            self.CFG_IDM_OFF, current=2, hours_span=HOURS_SPAN,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        assert result[1]['hours'][0:24] == FORECAST_R1[0:24]

    def test_no_zero_production_for_identical_forecast(self):
        """
        Kernbug-Test: Vor dem Fix war Delta=0 weil cur==da → Engine sah 0 MW.
        Nach dem Fix muss der echte Forecast-Wert ankommen.
        """
        forecasts = {1: {'hours': list(FORECAST_R1), 'bids': None}}
        da_snapshots = {1: list(DA_SNAPSHOT)}

        result, _, used_delta = apply_scheduler_delta(
            self.CFG_IDM_OFF, current=2, hours_span=HOURS_SPAN,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        assert not used_delta
        # Alle Stunden > 0 (kein künstliches Nullen durch Delta-Berechnung)
        assert all(v > 0 for v in result[1]['hours']), (
            "Keine Stunde darf durch Delta-Berechnung auf 0 fallen"
        )

    def test_dict_format_idm_off(self):
        """Auch das dict/trading-Format wird korrekt erkannt."""
        cfg = {"markets": {"idm": {"trading": ["off", "off"]}}}
        forecasts = {1: {'hours': list(FORECAST_R1), 'bids': None}}
        da_snapshots = {1: list(DA_SNAPSHOT)}

        result, status, used_delta = apply_scheduler_delta(
            cfg, current=2, hours_span=HOURS_SPAN,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        assert status == "off"
        assert used_delta is False
        assert result[1]['hours'][24:48] == FORECAST_R1[24:48]


# ─────────────────────────────────────────────────────────────────────────────
# 3. IDM=on → Delta wird korrekt berechnet (Regressionsschutz)
# ─────────────────────────────────────────────────────────────────────────────

class TestIdmOnDeltaApplied:
    """IDM=on: Delta muss weiterhin korrekt angewandt werden."""

    CFG_IDM_ON = {"markets": {"idm": ["on", "on"]}}

    def _make_forecast(self, round2_values_24_47):
        hours = list(FORECAST_R1)
        for i, v in enumerate(round2_values_24_47):
            hours[24 + i] = v
        return hours

    def test_positive_delta_applied(self):
        """Spieler erhöht Position für Stunden 24-47: +10 MW je Stunde."""
        # DA_SNAPSHOT[24+i] = 100 + 24 + i = 124+i  → +10 Delta means 134+i
        r2_hours = [134.0 + i for i in range(24)]   # +10 über DA-Snapshot (124+i)
        forecasts = {1: {'hours': self._make_forecast(r2_hours), 'bids': None}}
        da_snapshots = {1: list(DA_SNAPSHOT)}

        result, _, used_delta = apply_scheduler_delta(
            self.CFG_IDM_ON, current=2, hours_span=HOURS_SPAN,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        assert used_delta is True
        out = result[1]['hours']
        # Stunden 24-47: Delta = (134+i) - (124+i) = 10 für alle i
        for i in range(24):
            assert abs(out[24 + i] - 10.0) < 1e-9, (
                f"Stunde {24+i}: erwartetes Delta=10, got {out[24+i]}"
            )

    def test_zero_delta_when_forecast_unchanged(self):
        """
        Spieler reicht identischen Forecast ein: Delta=0 → Engine sieht 0 MW.
        Das ist das korrekte IDM-Verhalten (kein Abweichen von DA-Position).
        """
        forecasts = {1: {'hours': list(FORECAST_R1), 'bids': None}}
        da_snapshots = {1: list(DA_SNAPSHOT)}

        result, _, used_delta = apply_scheduler_delta(
            self.CFG_IDM_ON, current=2, hours_span=HOURS_SPAN,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        assert used_delta is True
        # Delta = 0 (korrektes IDM-Verhalten)
        assert all(result[1]['hours'][24 + i] == 0.0 for i in range(24))

    def test_negative_delta(self):
        """Spieler reduziert Position: negative Deltas erlaubt."""
        # DA_SNAPSHOT[24+i] = 124+i  → -10 Delta means 114+i
        r2_hours = [114.0 + i for i in range(24)]  # -10 unter DA-Snapshot (124+i)
        forecasts = {1: {'hours': self._make_forecast(r2_hours), 'bids': None}}
        da_snapshots = {1: list(DA_SNAPSHOT)}

        result, _, _ = apply_scheduler_delta(
            self.CFG_IDM_ON, current=2, hours_span=HOURS_SPAN,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        out = result[1]['hours']
        for i in range(24):
            assert abs(out[24 + i] - (-10.0)) < 1e-9

    def test_hours_outside_window_unchanged(self):
        """Stunden 0-23 (vor dem aktuellen Fenster) bleiben unverändert."""
        forecasts = {1: {'hours': list(FORECAST_R1), 'bids': None}}
        da_snapshots = {1: list(DA_SNAPSHOT)}

        result, _, _ = apply_scheduler_delta(
            self.CFG_IDM_ON, current=2, hours_span=HOURS_SPAN,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        # Stunden 0-23 dürfen nicht modifiziert werden
        assert result[1]['hours'][0:24] == FORECAST_R1[0:24]

    def test_market_code_treated_as_delta(self):
        """
        IDM-Status 'market_code' (nicht explizit 'off') → Delta wird angewandt.
        Das ist das Safe-Default-Verhalten.
        """
        cfg = {"markets": {}}  # kein IDM-Schlüssel → "market_code"
        forecasts = {1: {'hours': list(FORECAST_R1), 'bids': None}}
        da_snapshots = {1: list(DA_SNAPSHOT)}

        _, status, used_delta = apply_scheduler_delta(
            cfg, current=2, hours_span=HOURS_SPAN,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        assert status == "market_code"
        assert used_delta is True


# ─────────────────────────────────────────────────────────────────────────────
# 4. Mehrere Spieler
# ─────────────────────────────────────────────────────────────────────────────

class TestMultiplePlayers:
    """Beide Pfade (IDM=off / IDM=on) funktionieren mit mehreren Spielern."""

    def test_idm_off_all_players_unchanged(self):
        cfg = {"markets": {"idm": ["off", "off"]}}
        forecast_p1 = list(range(50, 98))   # 48 Werte
        forecast_p2 = list(range(200, 248))
        forecasts = {
            1: {'hours': forecast_p1, 'bids': None},
            2: {'hours': forecast_p2, 'bids': None},
        }
        da_snapshots = {
            1: list(forecast_p1),
            2: list(forecast_p2),
        }

        result, _, used_delta = apply_scheduler_delta(
            cfg, current=2, hours_span=24,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        assert not used_delta
        assert result[1]['hours'] == forecast_p1
        assert result[2]['hours'] == forecast_p2

    def test_idm_on_all_players_get_delta(self):
        cfg = {"markets": {"idm": ["on", "on"]}}
        da_p1 = [50.0] * 48
        da_p2 = [200.0] * 48
        cur_p1 = [50.0] * 24 + [60.0] * 24   # +10 in Stunden 24-47
        cur_p2 = [200.0] * 24 + [210.0] * 24  # +10 in Stunden 24-47

        forecasts = {
            1: {'hours': cur_p1, 'bids': None},
            2: {'hours': cur_p2, 'bids': None},
        }
        da_snapshots = {1: da_p1, 2: da_p2}

        result, _, _ = apply_scheduler_delta(
            cfg, current=2, hours_span=24,
            forecasts=forecasts, da_snapshots=da_snapshots
        )

        # Beide Spieler: Delta = 10 für Stunden 24-47
        for pid in [1, 2]:
            for i in range(24):
                assert result[pid]['hours'][24 + i] == 10.0

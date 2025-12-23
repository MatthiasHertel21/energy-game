# Designer Handbook (KSE)
## Energy Market Simulation Game (EMSG)

**Version**: 2.0 (Sprint 24)  
**Date**: 23. Dezember 2025  
**Audience**: Designers/Scenario Editors

---

## Inhaltsverzeichnis

1. [Einführung](#1-einführung)
2. [Kampagnen-Management](#2-kampagnen-management)
3. [Szenario-Editor (KSE)](#3-szenario-editor-kse)
4. [Tab: Allgemein](#4-tab-allgemein)
5. [Tab: Marktregeln](#5-tab-marktregeln)
6. [Tab: Grid](#6-tab-grid)
7. [Tab: Umgebung](#7-tab-umgebung)
8. [Tab: Events](#8-tab-events)
9. [Tab: Geräte](#9-tab-geräte)
10. [Tab: Player Types](#10-tab-player-types)
11. [Tab: Scoring](#11-tab-scoring)
12. [Validierung & Export](#12-validierung--export)
13. [Best Practices](#13-best-practices)
14. [Referenz: Konfigurationsschema](#14-referenz-konfigurationsschema)

---

## 1. Einführung

### Was ist der KSE?

Der **Knowledge Scenario Editor (KSE)** ist das Werkzeug zum Erstellen und Bearbeiten von Kampagnen und Szenarien. Als Designer definierst du:

- Marktstrukturen und Regeln
- Netzwerkinfrastruktur (Zonen, Übertragungskapazitäten)
- Kraftwerke, Erneuerbare, Speicher und Lasten
- Ereignisse (Ausfälle, Wetterextreme, Nachfragespitzen)
- Scoring-Regeln für die Bewertung

### Workflow-Übersicht

```
1. Kampagne erstellen
   └── Name, Beschreibung, Cover-Bild

2. Szenarien erstellen/bearbeiten
   ├── General Tab (Basics)
   ├── Market Rules Tab
   ├── Grid Tab
   ├── Environment Tab
   ├── Events Tab
   ├── Devices Tab
   ├── Player Types Tab
   └── Scoring Tab

3. Validieren & Testen
   └── Preview, Dry-Run

4. Veröffentlichen
   └── Kampagne publizieren → sichtbar im Catalog
```

### Navigation

| Route | Funktion |
|-------|----------|
| `/designer/campaigns` | Kampagnen-Liste und -Management |
| `/designer/scenarios` | Szenario-Liste |
| `/kse?scenarioId=...` | Szenario-Editor |

---

## 2. Kampagnen-Management

### 2.1 Kampagne erstellen

**Route**: `/designer/campaigns` → "Neue Kampagne"

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| **Name** | Eindeutiger Kampagnenname | "Einführung in Strommärkte" |
| **Beschreibung** | Markdown-fähig, erscheint im Catalog | "Lerne die Grundlagen..." |
| **Cover-Bild** | 640×640px, PNG oder JPG | Hochladen oder URL |
| **Veröffentlicht** | Sichtbar im Catalog? | Toggle Ein/Aus |

### 2.2 Szenarien zuweisen

Nach dem Erstellen einer Kampagne:

1. Klicke auf "Szenarien zuweisen"
2. Wähle existierende Szenarien aus der Liste
3. Reihenfolge per Drag & Drop festlegen
4. Pro Szenario konfigurieren:

| Option | Beschreibung |
|--------|--------------|
| **Solo erlaubt** | Spieler können dieses Szenario alleine starten |
| **Kohorten erlaubt** | Trainer können Sessions für Kohorten starten |

### 2.3 Kampagne veröffentlichen

- Toggle "Veröffentlicht" auf Ein
- Kampagne erscheint im `/catalog` für alle Spieler
- Änderungen an Szenarien werden sofort wirksam

### 2.4 Kampagne löschen

⚠️ **Warnung**: Löscht alle Zuweisungen, aber nicht die Szenarien selbst.

---

## 3. Szenario-Editor (KSE)

### 3.1 Neues Szenario erstellen

**Route**: `/designer/scenarios` → "Neues Szenario"

**Templates verfügbar:**

| Template | Beschreibung |
|----------|--------------|
| **Blank** | Leeres Szenario, alles manuell konfigurieren |
| **Standard Day** | 24h mit typischem SA-Mix |
| **High Renewables** | Hoher Solar/Wind-Anteil |
| **Peak Winter** | Hohe Nachfrage, Engpässe |

### 3.2 Szenario duplizieren

- Klicke auf ⋮ → "Duplizieren"
- Erstellt Kopie mit Suffix "_copy"
- Alle Konfiguration wird übernommen

### 3.3 Szenario exportieren/importieren

**Export:**
- ⋮ → "Export JSON"
- Vollständige Konfiguration als JSON-Datei

**Import:**
- "Import JSON" Button
- Wähle: Überschreiben oder Neues erstellen

---

## 4. Tab: Allgemein

### 4.1 Grundeinstellungen

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **Name** | Szenario-Name | "Neues Szenario" |
| **Objectives** | Lernziele, Markdown-fähig | (leer) |
| **Fake Date** | Simuliertes Datum | Heute |
| **Start Time** | Simulierte Startzeit | "00:00" |

### 4.2 Zeitparameter

| Feld | Beschreibung | Standardwert | Constraints |
|------|--------------|--------------|-------------|
| **Rounds** | Anzahl Spielrunden | 4 | 1-20 |
| **Round Duration (s)** | Echtzeit pro Runde | 300 | 60-3600 |
| **Round Span (h)** | Simulierte Stunden pro Runde | 6 | 1-24 |
| **Forecast Horizon (h)** | Sichtbarer Horizont | 48 | ≥ scenario_horizon |
| **Freeze Hours** | Stunden vor Lieferung eingefroren | 6 | ≤ round_span |

### 4.3 Berechnete Werte

```
scenario_horizon = rounds × round_span
Beispiel: 4 Runden × 6h = 24h Szenario
```

### 4.4 Objectives (Markdown)

Das Objectives-Feld unterstützt Markdown:

```markdown
## Lernziele

1. Verstehe den Day-Ahead Markt
2. Lerne Prognosen zu erstellen
3. Reagiere auf Ereignisse

**Hinweis**: Die ersten 200 Zeichen erscheinen als Vorschau im Catalog.
```

---

## 5. Tab: Marktregeln

### 5.1 Marktstruktur

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **Enable DA** | Day-Ahead Markt aktiv | ✓ |
| **Enable IDM** | Intraday Markt aktiv | ✓ |
| **Enable Balancing** | Ausgleichsenergie aktiv | ✓ |

### 5.2 Preisregeln

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **Base Price** | Basis-MCP (ZAR/MWh) | 1000 |
| **Base Volume** | Basis-Volumen (MWh) | 20000 |
| **Price Floor** | Mindestpreis (ZAR/MWh) | -500 |
| **Price Cap** | Höchstpreis (ZAR/MWh) | 5000 |
| **Allow Negative Pricing** | Preise < 0 erlaubt | ✓ |

### 5.3 Clearing-Optionen

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **Uniform Price** | Alle erhalten MCP | ✓ |
| **Pro-Rata Ties** | Bei Preisgleichheit proportional | ✓ |
| **Enable Player Bidding** | Spieler bieten Preise | ✗ |

### 5.4 Imbalance-Preise

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **Balancing Up Price** | Preis bei Unterlieferung | 1.5 × MCP |
| **Balancing Down Price** | Preis bei Überlieferung | 0.5 × MCP |

### 5.5 DA/ID Preisdifferenzierung (NEU Sprint 24)

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **day_ahead_gate_hour** | Gate-Closure Stunde | 12 |
| **id_price_spread_percent** | ID-Preisaufschlag (%) | 0 |

**Beispielwerte:**

| Spread | Effekt |
|--------|--------|
| 0 | DA und ID gleicher Preis |
| 8 | ID 8% teurer → Anreiz für gute DA-Planung |
| -5 | ID 5% günstiger → Flexibilität belohnt |

### 5.6 Transmission

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **Transmission Losses (%)** | Übertragungsverluste | 2 |

---

## 6. Tab: Grid

### 6.1 Zonen definieren

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **Anzahl Zonen** | 1-5 Zonen | 1 |
| **Zonen-Namen** | Liste der Zonennamen | ["Zone A"] |

### 6.2 ATC-Matrix (Available Transfer Capacity)

Symmetrische Matrix für Übertragungskapazitäten zwischen Zonen:

```
         Zone A    Zone B
Zone A   ∞         5000 MW
Zone B   5000 MW   ∞
```

**Eingabe:**
- Nur oberes Dreieck eingeben
- Unteres Dreieck wird gespiegelt

### 6.3 Engpass-Handling

| Option | Beschreibung |
|--------|--------------|
| **Curtail by Cost** | Günstigste Erzeuger zuerst abregeln |
| **Curtail Pro-Rata** | Proportional zur Kapazität |
| **Redispatch** | Teurere Erzeuger in anderer Zone aktivieren |

### 6.4 Congestion Revenue

| Option | Beschreibung |
|--------|--------------|
| **To Grid** | Engpasserlöse an den Netzbetreiber |
| **To Generators** | Engpasserlöse an betroffene Erzeuger |
| **Split** | 50/50 Aufteilung |

---

## 7. Tab: Umgebung

### 7.1 Marktteilnehmer

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **Producer Total (MW)** | Gesamte Erzeugerkapazität | 10000 |
| **Consumer Total (MW)** | Gesamte Verbraucherleistung | 8000 |
| **Number of Agents** | Synthetische Marktteilnehmer | 50 |

### 7.2 Gruppenanteile

Verteilung der Erzeugung auf Technologien (muss 100% ergeben):

| Gruppe | Anteil | Beschreibung |
|--------|--------|--------------|
| Coal | 40% | Kohlekraftwerke |
| Gas | 20% | Gaskraftwerke |
| Nuclear | 15% | Kernkraftwerke |
| Hydro | 10% | Wasserkraft |
| Solar | 10% | Photovoltaik |
| Wind | 5% | Windkraft |

### 7.3 Zonale Verteilung

Pro Gruppe: Wie viel Kapazität in welcher Zone?

```
Coal: Zone A: 60%, Zone B: 40%
Solar: Zone A: 80%, Zone B: 20%  (z.B. Nordkap)
```

### 7.4 Zufallsgenerator

| Feld | Beschreibung | Standardwert |
|------|--------------|--------------|
| **RNG Seed** | Fester Seed für Reproduzierbarkeit | (zufällig) |
| **Actual Noise (%)** | Abweichung Prognose/Realität | 5 |

### 7.5 Vorschau

- "Preview Curves" zeigt synthetische Angebots-/Nachfragekurven
- Export als PNG/SVG möglich

---

## 8. Tab: Events

### 8.1 Event-Typen

| Typ | Beschreibung | Beispiel |
|-----|--------------|----------|
| **Outage** | Kapazitätsausfall | "Koeberg Outage" |
| **Demand Spike** | Nachfrageanstieg | "Cold Snap" |
| **Price Shock** | Preisänderung | "Carbon Tax" |
| **Weather** | Wetterereignis | "Cloudy Day" |
| **Grid** | Netzstörung | "Line Trip" |

### 8.2 Event erstellen

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| **Name** | Event-Name | "Koeberg Unit 1 Outage" |
| **Description** | Beschreibung für Briefing | "Unplanned maintenance..." |
| **Type** | Event-Typ | Outage |
| **Scope** | Systemic / Player | Systemic |

### 8.3 Trigger-Bedingungen

| Trigger | Beschreibung | Beispiel |
|---------|--------------|----------|
| **Round** | Bei bestimmter Runde | Runde 3 |
| **Probability** | Zufällig mit Wahrscheinlichkeit | 30% |
| **Time** | Zu bestimmter Simulationszeit | Stunde 18 |

### 8.4 Dauer & Impact

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| **Duration (rounds)** | Anzahl aktiver Runden | 2 |
| **Duration (hours)** | Anzahl aktiver Stunden | 6 |
| **Impact Type** | Multiplikator (×) oder Offset (±) | × |
| **Impact Value** | Wert der Änderung | 0.5 (= 50%) |

### 8.5 Target-Spezifikation

| Target | Beschreibung | Beispiel |
|--------|--------------|----------|
| **All** | Betrifft alle Teilnehmer | "System-wide outage" |
| **Zone** | Betrifft eine Zone | "Zone A blackout" |
| **Type** | Betrifft Gerätetyp | "All coal plants" |
| **Device** | Betrifft spezifisches Gerät | "Koeberg Unit 1" |

### 8.6 Pre-Warning

| Feld | Beschreibung |
|------|--------------|
| **Enable Pre-Warning** | Spieler werden vorgewarnt |
| **Warning Rounds** | Wie viele Runden vorher |
| **Warning Text** | Angezeigter Warntext |

### 8.7 Timeline-Vorschau

- Visuelle Darstellung aller Events über Runden
- Überlappungen erkennbar
- Klick auf Event → Details

---

## 9. Tab: Geräte

### 9.1 Preset Library

Schnelles Erstellen mit vordefinierten Templates:

**Generatoren:**

| Preset | Kapazität | Effizienz | Variable Kosten |
|--------|-----------|-----------|-----------------|
| Coal | 600 MW | 35% | 400 ZAR/MWh |
| Gas (CCGT) | 400 MW | 50% | 600 ZAR/MWh |
| Gas (OCGT) | 200 MW | 35% | 900 ZAR/MWh |
| Hydro | 200 MW | 90% | 50 ZAR/MWh |
| Nuclear | 1000 MW | 33% | 150 ZAR/MWh |

**Erneuerbare:**

| Preset | Kapazität | Capacity Factor |
|--------|-----------|-----------------|
| Solar | 100 MW | 25% |
| Wind | 150 MW | 35% |

**Speicher:**

| Preset | Kapazität | Power | Effizienz |
|--------|-----------|-------|-----------|
| Battery (Li-ion) | 100 MWh | 50 MW | 85% |
| Pumped Hydro | 500 MWh | 100 MW | 75% |

**Lasten:**

| Preset | Baseline | Peak | DRM |
|--------|----------|------|-----|
| Industrial | 300 MW | 450 MW | ✓ |
| Commercial | 100 MW | 200 MW | ✓ |
| Residential | 150 MW | 300 MW | ✗ |

### 9.2 Geräte-Felder

**Alle Geräte:**

| Feld | Beschreibung | Erforderlich |
|------|--------------|--------------|
| **id** | Eindeutige ID (auto-generiert) | ✓ |
| **name** | Anzeigename | Empfohlen |
| **type** | Gerätetyp | ✓ |
| **zone** | Zugehörige Zone | ✓ |

**Generator-spezifisch:**

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| **capacity_mw** | Nennleistung | 600 |
| **efficiency** | Wirkungsgrad (0-1) | 0.35 |
| **variable_cost_zar_per_mwh** | Brennstoffkosten | 400 |
| **ramp_up_mw_per_h** | Max. Hochfahren | 100 |
| **ramp_down_mw_per_h** | Max. Runterfahren | 100 |
| **min_stable_mw** | Minimale Teillast | 200 |
| **start_cost_zar** | Anfahrkosten | 50000 |

**Renewable-spezifisch:**

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| **capacity_mw** | Installierte Leistung | 100 |
| **capacity_factor** | Durchschn. Auslastung | 0.25 |
| **profile** | Stündliches Profil (optional) | [0, 0, ..., 0.8, 1, 0.7, ...] |

**Storage-spezifisch:**

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| **capacity_mwh** | Speicherkapazität | 100 |
| **power_mw** | Lade-/Entladeleistung | 50 |
| **efficiency** | Round-Trip Effizienz | 0.85 |
| **initial_soc** | Anfangs-SoC (0-1) | 0.5 |
| **min_soc** | Minimum SoC | 0.1 |
| **max_soc** | Maximum SoC | 0.9 |

**Load-spezifisch:**

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| **baseline_mw** | Grundlast | 300 |
| **peak_mw** | Spitzenlast | 450 |
| **drm_capable** | Demand Response möglich | true |
| **flexibility_pct** | Max. Flexibilität | 20 |
| **profile** | Stündliches Profil (optional) | [0.6, 0.5, ..., 1, ...] |

### 9.3 Aktionen

| Aktion | Beschreibung |
|--------|--------------|
| **Add from Preset** | Gerät aus Bibliothek hinzufügen |
| **Duplicate** | Gerät kopieren (neue ID) |
| **Delete** | Gerät entfernen |

### 9.4 Validierung

- IDs müssen eindeutig sein
- Pflichtfelder pro Typ werden geprüft
- Numerische Bereiche werden validiert
- Referenzierte Zonen müssen existieren

---

## 10. Tab: Player Types

### 10.1 Wann benötigt?

Player Types sind erforderlich für **Trainer-geführte Shared Market Sessions**.

Jeder Player Type definiert:
- Welche Geräte ein Spieler kontrolliert
- In welcher Zone der Spieler agiert (optional)

### 10.2 Player Type erstellen

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| **id** | Eindeutige ID (auto-generiert) | ptype_1703340000_abc |
| **name** | Anzeigename | "Generator Operator" |
| **devices** | Liste zugewiesener Geräte-IDs | ["coal_001", "gas_001"] |
| **zone** | Optionale Zone | "Zone A" |

### 10.3 Best Practices

| Empfehlung | Begründung |
|------------|------------|
| 2-4 Player Types | Übersichtlich für Trainer |
| Komplementäre Rollen | z.B. Erzeuger vs Verbraucher |
| Ausgewogene Kapazitäten | Keine Übermacht eines Typs |
| Beschreibende Namen | "Wind Farm Operator" statt "Type A" |

### 10.4 Beispielkonfiguration

```json
"player_types": [
  {
    "id": "ptype_gen",
    "name": "Conventional Generator",
    "devices": ["coal_001", "gas_001", "nuclear_001"],
    "zone": "Zone A"
  },
  {
    "id": "ptype_re",
    "name": "Renewable Operator",
    "devices": ["solar_001", "wind_001", "battery_001"],
    "zone": "Zone B"
  },
  {
    "id": "ptype_consumer",
    "name": "Industrial Consumer",
    "devices": ["load_001", "load_002"],
    "zone": "Zone A"
  }
]
```

---

## 11. Tab: Scoring

### 11.1 KPI-Gewichtung

Definiere wie der Total Score berechnet wird:

| KPI | Beschreibung | Typisches Gewicht |
|-----|--------------|-------------------|
| **Profit** | Gewinn | 0.6 (60%) |
| **Imbalance** | Prognosegenauigkeit (Penalty) | 0.3 (30%) |
| **Curtailment** | Abregelungskosten (Penalty) | 0.1 (10%) |

**Wichtig**: Gewichte müssen 1.0 ergeben!

### 11.2 Normalisierung

| Methode | Beschreibung |
|---------|--------------|
| **Z-Score** | Standardisierung auf μ=0, σ=1 |
| **Min-Max** | Skalierung auf [0, 100] |

### 11.3 Leaderboard-Optionen

| Option | Beschreibung |
|--------|--------------|
| **Global** | Ein Leaderboard für alle |
| **Per Role** | Separate Rankings pro Player Type |
| **Hidden** | Kein Ranking während des Spiels |

### 11.4 Referenz-Run (Optional)

- Lade einen "Expert Run" hoch
- Spieler werden gegen Referenz verglichen
- Nützlich für Benchmarking

---

## 12. Validierung & Export

### 12.1 Frontend-Validierung

Prüft in Echtzeit:
- Numerische Bereiche
- Pflichtfelder
- Eindeutige IDs
- Summen (z.B. Gruppenanteile = 100%)

### 12.2 Backend-Validierung

Prüft bei Save:
- `horizon = rounds × span`
- Alle Gerät-Referenzen existieren
- ATC-Matrix symmetrisch
- Event-Targets existieren
- Player Type Devices existieren

### 12.3 "Save & Validate" Button

- Speichert und führt vollständige Validierung durch
- Zeigt Liste aller Fehler/Warnungen
- Blockiert Speichern bei kritischen Fehlern

### 12.4 Export JSON

Vollständige Konfiguration als JSON:

```json
{
  "id": 42,
  "name": "Standard Day",
  "config": {
    "general": { ... },
    "market": { ... },
    "grid": { ... },
    "environment": { ... },
    "events": [ ... ],
    "devices": [ ... ],
    "player_types": [ ... ],
    "scoring": { ... }
  }
}
```

### 12.5 Import JSON

- Datei auswählen
- Wähle: "Überschreiben" oder "Neues erstellen"
- Validierung wird durchgeführt

---

## 13. Best Practices

### 13.1 Szenario-Design

| Empfehlung | Begründung |
|------------|------------|
| Klare Objectives | Spieler wissen was erwartet wird |
| Gestaffelte Komplexität | Einfache Szenarien zuerst |
| ≤3 Events pro Szenario | Nicht überladen |
| Realistische SA-Mixe | Authentische Lernwirkung |
| 2-4 Player Types | Übersichtlich für Trainer |

### 13.2 Kampagnen-Struktur

```
Kampagne: "Einführung Strommarkt"
├── Szenario 1: "Grundlagen" (Solo, einfach)
├── Szenario 2: "Day-Ahead Markt" (Solo/Kohort)
├── Szenario 3: "Events & Risiko" (Kohort)
└── Szenario 4: "Vollständige Simulation" (Kohort, komplex)
```

### 13.3 Testen

| Schritt | Beschreibung |
|---------|--------------|
| 1. Preview | Kurz-Check der Konfiguration |
| 2. Dry-Run | Solo als Designer durchspielen |
| 3. Peer Review | Kollegen prüfen lassen |
| 4. Pilot-Session | Mit kleiner Testgruppe |

### 13.4 Häufige Fehler

| Fehler | Lösung |
|--------|--------|
| Horizon ≠ rounds × span | Werte anpassen |
| Fehlende Geräte-Referenzen | Geräte-IDs prüfen |
| Summe ≠ 100% | Gruppenanteile korrigieren |
| Event ohne Target | Target-Gerät definieren |
| Doppelte IDs | Automatisch regenerieren lassen |

---

## 14. Referenz: Konfigurationsschema

### 14.1 Vollständiges Schema

```json
{
  "general": {
    "name": "string",
    "objectives": "string (markdown)",
    "fake_date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "rounds": "integer (1-20)",
    "round_duration_seconds": "integer (60-3600)",
    "round_span_hours": "integer (1-24)",
    "forecast_horizon_hours": "integer",
    "freeze_hours": "integer"
  },
  "market": {
    "enable_da": "boolean",
    "enable_idm": "boolean",
    "enable_balancing": "boolean",
    "base_price": "number",
    "base_volume_mwh": "number",
    "price_floor": "number",
    "price_cap": "number",
    "allow_negative_pricing": "boolean",
    "uniform_price": "boolean",
    "pro_rata_ties": "boolean",
    "enable_player_bidding": "boolean",
    "balancing_up_price_factor": "number",
    "balancing_down_price_factor": "number",
    "day_ahead_gate_hour": "integer (0-23)",
    "id_price_spread_percent": "number (-100 to 100)"
  },
  "grid": {
    "zones": ["string"],
    "atc": [[number]],
    "congestion_handling": "curtail_by_cost | curtail_pro_rata | redispatch",
    "congestion_revenue": "to_grid | to_generators | split",
    "transmission_losses_pct": "number (0-100)"
  },
  "environment": {
    "producer_total_mw": "number",
    "consumer_total_mw": "number",
    "num_agents": "integer",
    "group_shares": {
      "coal": "number (0-1)",
      "gas": "number (0-1)",
      "...": "..."
    },
    "zonal_splits": {
      "coal": {"Zone A": 0.6, "Zone B": 0.4},
      "...": "..."
    },
    "seed": "string | null",
    "actual_noise_pct": "number (0-100)"
  },
  "events": [
    {
      "name": "string",
      "description": "string",
      "type": "outage | demand_spike | price_shock | weather | grid",
      "scope": "systemic | player",
      "trigger": {
        "type": "round | probability | time",
        "value": "number"
      },
      "duration_rounds": "integer",
      "duration_hours": "integer",
      "impact": {
        "type": "multiply | add",
        "value": "number"
      },
      "target": {
        "type": "all | zone | device_type | device",
        "value": "string"
      },
      "pre_warning": {
        "enabled": "boolean",
        "rounds_before": "integer",
        "text": "string"
      }
    }
  ],
  "devices": [
    {
      "id": "string (unique)",
      "name": "string",
      "type": "generator | renewable | storage | load",
      "zone": "string",
      "...type-specific fields...": "..."
    }
  ],
  "player_types": [
    {
      "id": "string (unique)",
      "name": "string",
      "devices": ["string (device ids)"],
      "zone": "string | null"
    }
  ],
  "scoring": {
    "weights": {
      "profit": "number (0-1)",
      "imbalance": "number (0-1)",
      "curtailment": "number (0-1)"
    },
    "normalization": "z_score | min_max",
    "leaderboard": "global | per_role | hidden",
    "reference_run": "object | null"
  }
}
```

---

## Support

- **Technische Fragen**: support@emsg.example.com
- **Dokumentation**: `/docs/designer` im Spiel
- **API-Referenz**: docs/CALCULATION_ENGINE.md

---

*Letzte Aktualisierung: 23. Dezember 2025*

# Analyse: Zeitpunkt der Market Structure Grafik im Player Screen

## Frage
Für welchen Zeitpunkt wird die Marktgrafik (Market Structure) im Player Screen angezeigt?

## Code-Analyse

### 1. Frontend - MarketCurves Komponente

**Datei:** `/frontend/src/pages/Player.jsx` (Zeile 56-181)

Die `MarketCurves` Komponente erhält nur einen Parameter:
```javascript
function MarketCurves({ cfg }) {
  // ...
}
```

**Eingabedaten:**
```javascript
const baseP = Number(cfg.market.base_price || 1000)
const baseV = Number(cfg.market.base_volume_mwh || 2000)
const mix = cfg.market?.generator_mix || { pv: 250, wind: 200, hydro: 100, coal: 300, gas: 150 }
const seedStr = cfg.environment?.seed || 'step'
const cmix = cfg.market?.consumer_mix || { industrial: 400, household: 500, agriculture: 100 }
```

**Wichtig:**
- ❌ **KEINE** Stunden-Parameter
- ❌ **KEINE** Runden-Parameter  
- ❌ **KEINE** Zeit-abhängige Berechnung
- ✅ Nur statische Szenario-Konfiguration

### 2. Datenquelle - Session Briefing Endpoint

**Datei:** `/backend/app/sessions.py` (Zeile 213-280)

```python
@ns.route("/<int:sid>/briefing")
class SessionBriefing(Resource):
    @jwt_required()
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        sc = Scenario.query.get_or_404(s.scenario_id)
        cfg = sc.config or {}
        briefing = {
            "markets": cfg.get("market", {}),
            # ...
        }
```

**Datenfluss:**
1. Session → Scenario → Config → Market
2. `cfg.market` enthält **statische** Werte aus der Szenario-Definition
3. **Keine** Runden- oder Stunden-spezifische Variation

### 3. Player Screen - Verwendung

**Datei:** `/frontend/src/pages/Player.jsx` (Zeile 2240)

```jsx
<MarketCurves cfg={cfg} />
```

Mit Tooltip:
```jsx
title="Supply and demand curves show the market structure at the start of this round. 
       The intersection point determines the System Marginal Price (SMP)."
```

**Problem:** Der Tooltip sagt "at the start of this round", aber der Code verwendet **immer dieselben Daten**.

### 4. Config-Laden im Player

**Datei:** `/frontend/src/pages/Player.jsx` (Zeile 766-776)

```javascript
const { data } = await api.get(`/api/sessions/${sessionId}/briefing`)
setCfg({
  general: { ... },
  market: data.markets || {},  // <-- Statische Daten
  current_round: Number(sessionData.current_round || 1),
  // ...
})
```

**Ablauf:**
1. Briefing wird **einmal** beim Laden geladen
2. `cfg.market` wird gesetzt mit statischen Szenario-Daten
3. `cfg.current_round` wird aktualisiert bei Runden-Wechsel
4. **ABER:** `cfg.market` wird **NICHT** neu geladen oder aktualisiert

## Antwort auf die Frage

### Die Market Structure Grafik zeigt:

**❌ NICHT:**
- Eine spezifische Stunde
- Die aktuellen Marktbedingungen
- Runden-spezifische Anpassungen
- Tatsächliche Supply/Demand zum aktuellen Zeitpunkt

**✅ SONDERN:**
- **Statische Momentaufnahme** basierend auf:
  - `market.base_price` (z.B. 1000 ZAR/MWh)
  - `market.base_volume_mwh` (z.B. 20000 MWh)
  - `market.generator_mix` (z.B. pv: 250, coal: 300, ...)
  - `market.consumer_mix` (z.B. industrial: 400, household: 500, ...)
  - `environment.seed` für deterministisches Jittern
  - `market.random_capacity_pct` und `market.random_price_pct`

- **Zeitpunkt:** "Beispielhaft" / "Generisch" - **nicht** an eine bestimmte Stunde gebunden
- **Zweck:** Zeigt die **generelle Marktstruktur** des Szenarios
- **Konstanz:** Bleibt über alle Runden gleich (solange Szenario-Config nicht ändert)

## Relevanz für Feedback-Analyse (Frage 1.9)

Die Antwort im `feedback_analysis.md` ist **KORREKT**:

> "Die dem Player angezeigte **Market Structure ist immer die historische** zum Zeitpunkt des Rundenbeginns **ohne Berücksichtigung der Player-Angebote**"

**Präzisierung:** 
- Nicht "historisch zum Rundenbegin", sondern **statisch aus der Szenario-Definition**
- Zeigt eine **generische/exemplarische Stunde** mit typischer Marktstruktur
- **Keine zeitliche Zuordnung** zu einer spezifischen Stunde oder Runde

### Warum ist das so designed?

Wie im Feedback korrekt erklärt:
1. **Verhindert Zirkel-Referenzen:** Spieler-Bids würden die Grafik ändern, die wiederum Spieler-Entscheidungen beeinflusst
2. **Price-Taking Verhalten:** Spieler sehen "den Markt" und können darauf reagieren
3. **Pädagogischer Wert:** Zeigt die grundsätzliche Marktstruktur ohne spieler-induzierte Verzerrungen

## Technische Limitation

**Problem:** Die Marktstruktur ist stunden-abhängig:
- PV produziert nur tagsüber
- Wind hat tages- und wetterabhängige Profile  
- Demand variiert nach Tageszeit (base/mid/peak)

**Aber:** Die aktuelle Implementation zeigt nur **einen generischen Mix** ohne Stunden-Differenzierung.

## Mögliche Verbesserung

Wenn man stunden-spezifische Marktstrukturen zeigen wollte:

1. **Hour-Selector** hinzufügen (wie in Feedback 1.10 vorgeschlagen)
2. **Zeitabhängige Profile** in der Backend-Berechnung berücksichtigen
3. **Supply/Demand Curves** pro Stunde generieren basierend auf:
   - Solar-Verfügbarkeit (0 nachts, max mittags)
   - Wind-Profil
   - Demand-Profil (base/mid/peak)

**Aber:** Das würde die Komplexität erhöhen und den Zweck der Grafik ändern (von "struktureller Übersicht" zu "stunden-spezifischer Prognose").

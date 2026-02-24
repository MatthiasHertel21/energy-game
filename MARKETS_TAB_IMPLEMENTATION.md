# Markets Tab Implementation

## Übersicht

Der neue **Markets Tab** im KSE ermöglicht es, für jede Runde individuell zu konfigurieren, welche Märkte (DAM, IDM, BAL) aktiv oder inaktiv sind.

## Features

### 1. KSE Markets Tab (Frontend)

**Datei:** `/frontend/src/pages/KSE.jsx`

- **Neuer Tab:** "Markets" zwischen "Market" und "Grid"
- **Matrix-UI:** 3 Zeilen (DAM, IDM, BAL) × N Spalten (Runden 1..N)
- **3 Stati pro Markt-Runden-Kombination:**
  - **Market Code** (Default, blau): Markt folgt SAWEM-Regeln (Gate Hours, DA Cutoff, ID Gates)
  - **Always On** (grün): Markt ist immer aktiv, ignoriert Gate Hours
  - **Off** (rot): Markt ist deaktiviert

**Config-Struktur:**
```javascript
markets: {
  dam: ["market_code", "market_code", "off", ...],  // Pro Runde
  idm: ["market_code", "market_code", "market_code", ...],
  bal: ["market_code", "market_code", "market_code", ...]
}
```

### 2. Backend Anpassungen

**Datei:** `/backend/app/player.py`

#### `_get_tradeable_hours()`
- Prüft markets config für die aktuelle Runde
- **Wenn DAM + IDM = "off":** Keine Stunden handelbar
- **Wenn DAM oder IDM = "on":** Alle Stunden handelbar (ignoriert Gates)
- **Wenn "market_code":** Bisherige Gate-Logik (Default)

#### `generate_market_timeline()`
- Berücksichtigt markets config beim Generieren von `hour_status`
- **"off":** Alle Stunden = "forecast"
- **"on":** Alle Stunden = "da" oder "id" (je nach Markt)
- **"market_code":** Detaillierte Gate-basierte Phase-Berechnung

### 3. Player UI

**Datei:** `/frontend/src/pages/Player.jsx`

Die Player UI nutzt bereits `daBaseline.hour_status` vom Backend und zeigt die korrekten Marktphasen in der `MarketPhaseTimeline`-Komponente an. Keine Änderungen erforderlich.

## Verwendung

### Im KSE

1. Öffne ein Szenario im KSE
2. Gehe zum **"Markets"** Tab
3. Für jede Markt-Runden-Kombination:
   - Wähle **Market Code** für Standard-SAWEM-Verhalten
   - Wähle **Always On** um Gates zu deaktivieren (z.B. für Trainingsszenarien)
   - Wähle **Off** um den Markt komplett zu deaktivieren

### Beispiel-Szenarien

#### Nur DAM (Round 1)
```
Dam: ["market_code", "off", "off", "off"]
IDM: ["off", "off", "off", "off"]
BAL: ["market_code", "market_code", "market_code", "market_code"]
```

#### DAM + IDM mit progression
```
DAM: ["market_code", "off", "off", "off"]
IDM: ["off", "market_code", "market_code", "market_code"]
BAL: ["market_code", "market_code", "market_code", "market_code"]
```

#### Training Mode (keine Gates)
```
DAM: ["on", "on", "on", "on"]
IDM: ["on", "on", "on", "on"]
BAL: ["on", "on", "on", "on"]
```

## Bestehende Szenarien

Bestehende Szenarien ohne `markets` Config im JSON verwenden automatisch den Default **"market_code"** für alle Märkte und Runden. Damit bleibt das bisherige Verhalten erhalten.

## Testing

### Frontend Test
1. KSE öffnen
2. Neues Szenario erstellen
3. Zum Markets Tab navigieren
4. Matrix sollte visible sein mit 3 Zeilen und N Spalten (je nach `general.rounds`)
5. Stati ändern → Farbe der Dropdowns sollte sich entsprechend ändern

### Backend Test
1. Szenario mit markets config erstellen
2. Session starten mit dem Szenario
3. Als Player einloggen
4. MarketPhaseTimeline sollte die korrekten Phasen anzeigen
5. Gate-Verhalten sollte der markets config entsprechen

### API-Endpoints betroffen
- `GET /api/player/da-baseline` - Nutzt `generate_market_timeline()`
- `GET /api/player/tradeable-hours` - Nutzt `_get_tradeable_hours()`
- `POST /api/player/forecast` - Validiert mit `_get_tradeable_hours()`

## Dateien geändert

1. **Frontend:**
   - `/frontend/src/pages/KSE.jsx`
     - defaultConfig erweitert (markets-Struktur)
     - Neuer Tab "Markets" eingefügt (Index 3)
     - Alle folgenden Tab-Indices angepasst (Grid: 3→4, Events: 4→5, Player Types: 5→6, Challenges: 6→7)
     - Markets Tab UI mit Matrix-Editor

2. **Backend:**
   - `/backend/app/player.py`
     - `_get_tradeable_hours()`: markets config Logik
     - `generate_market_timeline()`: markets config Logik

## Kompatibilität

- ✅ **Rückwärtskompatibel:** Szenarien ohne markets config funktionieren mit Default "market_code"
- ✅ **Keine Migrations:** JSON-Config-Feld wird dynamisch erweitert
- ✅ **Keine Breaking Changes:** Bestehende Gate-Logik bleibt für "market_code" unverändert

## Nächste Schritte

Optional weitere Verbesserungen:
1. **Bulk-Edit:** Alle Zellen einer Zeile/Spalte auf einmal setzen
2. **Presets:** Templates für häufige Konfigurationen (z.B. "DAM Only", "Full Markets")
3. **Validation:** Warnung wenn alle Märkte "off" sind
4. **Visualisierung:** Timeline-Vorschau zeigt verfügbare Märkte pro Runde

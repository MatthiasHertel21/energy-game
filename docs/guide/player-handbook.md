# Player Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 2.0 (Sprint 24)  
**Date**: 23. Dezember 2025  
**Audience**: Players/Students

---

## Inhaltsverzeichnis

1. [Einführung](#1-einführung)
2. [Erste Schritte](#2-erste-schritte)
3. [Navigation & Seiten](#3-navigation--seiten)
4. [Spielablauf](#4-spielablauf)
5. [Player Interface im Detail](#5-player-interface-im-detail)
6. [Märkte verstehen](#6-märkte-verstehen)
7. [Ergebnisse & Auswertung](#7-ergebnisse--auswertung)
8. [Tipps & Strategien](#8-tipps--strategien)
9. [Troubleshooting](#9-troubleshooting)
10. [Glossar](#10-glossar)

---

## 1. Einführung

### Was ist EMSG?

Das Energy Market Simulation Game (EMSG) ist eine interaktive Simulation des südafrikanischen Strommarkts. Du lernst:

- Wie Strommärkte funktionieren (Day-Ahead, Intraday, Balancing)
- Prognosen für Erzeugung und Verbrauch zu erstellen
- Strategische Entscheidungen unter Unsicherheit zu treffen
- Die Auswirkungen von Ereignissen (z.B. Kraftwerksausfälle) zu managen

### Spielmodi

| Modus | Beschreibung | Gestartet von |
|-------|--------------|---------------|
| **Solo** | Eigener privater Markt, nur deine Entscheidungen zählen | Du selbst via Catalog |
| **Shared Market** | Handel mit anderen Spielern, Rollen-basiert | Trainer |

### Typischer Spielablauf

```
Login → Home → Catalog/Session wählen → Briefing lesen → 
→ Runden spielen (Forecast → Submit → Results) → Evaluation
```

---

## 2. Erste Schritte

### 2.1 Registrierung

1. Öffne `/register` im Browser
2. Gib E-Mail und Passwort ein
3. **Wichtig**: Einige Szenarien erfordern Admin-Freigabe

### 2.2 Login

1. Öffne `/login`
2. Gib deine Zugangsdaten ein
3. Du wirst zu `/home` weitergeleitet

### 2.3 Profil

Unter `/profile` kannst du:
- Passwort ändern
- Anzeigeeinstellungen anpassen
- Theme (Hell/Dunkel) wechseln

---

## 3. Navigation & Seiten

### 3.1 Home (`/home`)

Deine Startseite zeigt:

| Bereich | Inhalt |
|---------|--------|
| **Aktive Sessions** | Laufende Spiele, an denen du teilnimmst |
| **Zugewiesene Szenarien** | Szenarien, die dein Trainer für dich aktiviert hat |
| **Letzte Ergebnisse** | Zusammenfassung abgeschlossener Sessions |

**Aktionen:**
- Klicke auf eine Session → öffnet Player oder Evaluation
- "Zum Catalog" → öffnet Campaign Catalog

### 3.2 Campaign Catalog (`/catalog`)

Der Catalog zeigt alle veröffentlichten Kampagnen:

**Kampagnen-Karten:**
- Cover-Bild (640×640px)
- Name und Beschreibung
- Fortschrittsbalken (abgeschlossene Szenarien)
- Anzahl der Szenarien

**Szenario-Timeline:**
- Klicke auf eine Kampagne → zeigt Szenarien als Timeline
- Jedes Szenario zeigt:
  - Vorschau der Objectives (erste 200 Zeichen)
  - Status (nicht gestartet / in Bearbeitung / abgeschlossen)
  - "Solo starten" Button (wenn aktiviert)
  - "Session beitreten" (wenn Trainer-Session aktiv)

**Aktionen:**
- ▶️ Solo starten: Startet eine private Session
- 🔄 Zurücksetzen: Löscht deinen Fortschritt für dieses Szenario
- 👥 Beitreten: Tritt einer laufenden Trainer-Session bei

### 3.3 Briefing (`/briefing?sessionId=...`)

Vor dem Spielen siehst du alle wichtigen Informationen:

| Abschnitt | Inhalt |
|-----------|--------|
| **Objectives** | Lernziele und Aufgabenstellung (Markdown) |
| **Allgemein** | Runden, Dauer, Zeithorizont, Freeze-Stunden |
| **Marktregeln** | DA/ID/Balancing, Preisfloor/-cap, Imbalance-Preise |
| **Grid** | Zonen, ATC (Available Transfer Capacity) |
| **Deine Rolle** | Player Type, zugewiesene Geräte (Shared Market) |
| **Events** | Geplante oder mögliche Ereignisse |
| **Scoring** | Gewichtung der KPIs für die Bewertung |

**Buttons:**
- "Start Playing" → öffnet Player Interface
- "Back to Home" → zurück zur Startseite

### 3.4 Player (`/player?sessionId=...`)

Das Hauptspiel-Interface. Details in [Abschnitt 5](#5-player-interface-im-detail).

### 3.5 Evaluation (`/evaluation?sessionId=...`)

Nach Spielende siehst du:
- Zusammenfassung aller KPIs
- Rundenweise Ergebnisse als Tabelle
- Trend-Charts (Profit, MCP, Volume über Runden)
- Vergleich mit Kohorten-Durchschnitt
- Market Breakdown (DA vs ID Aufschlüsselung)
- PDF-Export

### 3.6 Leaderboard (`/leaderboard?sessionId=...`)

Ranking aller Spieler nach:
- Gewählter Metrik (Profit, Revenue, Imbalance, Curtailment)
- Scoring-Regeln des Szenarios

### 3.7 Replay (`/replay?sessionId=...`)

Runde für Runde nachspielen:
- Schritt-für-Schritt Navigation
- Autoplay mit Pause
- Overlay: Kohorten-Durchschnitt oder Referenz-Run

---

## 4. Spielablauf

### 4.1 Rundenstruktur

Ein typisches Szenario hat 4-8 Runden:

```
Runde 1 (Day-Ahead)
├── Forecast für Stunden 0-23 erstellen
├── Submit vor Timer-Ende
└── Market Clearing → Ergebnis

Runde 2-N (Intraday)
├── Forecast anpassen (nur nicht-gefrorene Stunden)
├── Submit vor Timer-Ende
└── Market Clearing → Ergebnis
```

### 4.2 Timer

| Farbe | Bedeutung |
|-------|-----------|
| 🟢 Grün | > 60 Sekunden |
| 🟡 Gelb | 31-60 Sekunden |
| 🔴 Rot | ≤ 30 Sekunden |
| ⚫ Grau | Zeit abgelaufen, kein Submit möglich |

**Wichtig**: Der Timer läuft serverseitig. Auch bei Seitenrefresh bleibt die Zeit gleich.

### 4.3 Freeze (Einfrieren)

- Nach Runde 1 werden frühere Stunden "eingefroren"
- Gefrorene Stunden können nicht mehr bearbeitet werden
- Erkennbar an grauer Hintergrundfarbe und deaktiviertem Input
- Im Chart: Orange gestreifte "LOCKED" Zone

### 4.4 Round Results

Nach jeder Runde erscheint ein Modal mit:

**KPI-Karten:**
- Profit (ZAR)
- Revenue (ZAR)
- Variable Costs (ZAR)
- Imbalance Cost (ZAR)
- Curtailment (ZAR, nur bei Erzeugern)
- Total Score (0-100)

**Ranking:**
- Dein Platz im Vergleich zu anderen Spielern
- Nur in Shared Market Sessions

**DA/ID Market Breakdown:**
- Day-Ahead Volume und Revenue
- Intraday Delta und Revenue
- Tägliche Aufschlüsselung (klappbar)

**Active Events:**
- Liste der in dieser Runde aktiven Ereignisse
- Typ und Beschreibung

### 4.5 Scenario Results

Nach der letzten Runde:
- Zusammenfassung über alle Runden
- Option: "Zur Evaluation" oder "Zurück zum Catalog"

---

## 5. Player Interface im Detail

### 5.1 Layout-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Session Info, Timer, Status                        │
├────────────────┬────────────────────────────────────────────┤
│                │                                            │
│  Live KPIs     │        Forecast Editor                     │
│  - MCP         │        (Chart oder Fields)                 │
│  - Volume      │                                            │
│  - Status      │        [Device 1]                          │
│                │        [Device 2]                          │
│                │        ...                                 │
│                │                                            │
│                │        [Save] [Submit]                     │
│                │                                            │
├────────────────┴────────────────────────────────────────────┤
│  Charts: MCP und Volume über Runden                         │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Forecast Editor

#### Chart-Modus (Standard)

Der Chart-Editor bietet intuitive Drag-and-Drop-Bearbeitung:

- **Volle Interaktivität**: Klicke und ziehe irgendwo im Chart
- **Y-Achse**: Automatisch skaliert auf 110% der Geräte-Kapazität
- **X-Achse**: Stunden des Forecast-Horizonts (0-47 oder 0-71)
- **Zonen-Visualisierung**:
  
  | Zone | Farbe | Bedeutung |
  |------|-------|-----------|
  | LOCKED | Orange gestreift | Bereits abgerechnet, nicht änderbar |
  | DAY-AHEAD | Grau halbtransparent | Bei Gate-Closure committed |
  | INTRADAY | Grün halbtransparent | Noch anpassbar |
  | FUTURE | Blau gepunktet | Außerhalb des aktuellen Horizonts |

- **Glättungsradius**: 3 Stunden - Bearbeitung einer Stunde passt Nachbarstunden sanft an (triangulares Falloff)
- **Chart-Größe**: 700×320px für präzise Bearbeitung

#### Field-Modus

- Numerische Eingabefelder für jede Stunde (0-23 oder mehr)
- Min/Max/Step gemäß Geräte-Constraints
- Gefrorene Stunden sind deaktiviert (grau)
- Validierung bei Eingabe (rote Umrandung bei Fehler)

#### Umschalten

- Toggle-Button oben rechts am Geräte-Abschnitt: 📊/📝
- Chart ↔ Fields unabhängig pro Gerät wählbar

### 5.3 Geräte-Informationen

Jedes Gerät zeigt einen Header mit:

| Feld | Beispiel | Gerätetypen |
|------|----------|-------------|
| **Name** | "Koeberg Unit 1" | Alle |
| **Typ** | Nuclear / Coal / Gas / Hydro / Wind / Solar / Battery / Load | Alle |
| **Zone** | Zone A / Zone B | Alle |
| **Kapazität** | 1000 MW | Generator, Renewable |
| **Effizienz** | 33% | Generator |
| **Capacity Factor** | 25% | Renewable |
| **Power/Capacity** | 50 MW / 100 MWh | Storage |
| **Variable Kosten** | 250 ZAR/MWh | Generator |
| **Ramping** | ±100 MW/h | Generator |
| **Baseline/Peak** | 300/450 MW | Load |

### 5.4 Aktionen

| Button | API-Call | Effekt |
|--------|----------|--------|
| **Save Full Forecast** | POST `/api/player/forecast/full` | Speichert alle Stunden, kein Submit |
| **Submit Current Round** | POST `/api/player/forecast` | Submitted nur aktuelle Runden-Slice |

**Wichtig**: Save ≠ Submit!
- **Save**: Zwischenspeichern, jederzeit möglich, persistent über Seitenrefresh
- **Submit**: Verbindliche Abgabe für die Runde, nicht rückgängig machbar

### 5.5 Player Type (Shared Market)

In Trainer-geführten Sessions:

1. **Typ-Auswahl-Dialog** erscheint beim ersten Laden
2. Zeigt verfügbare Player Types mit:
   - Name (z.B. "Generator Operator")
   - Zugewiesene Geräte
   - Verbleibende Kapazität (Slots)
3. Nach Auswahl:
   - Nur deine Geräte werden im Editor angezeigt
   - Aggregat-Forecast wird automatisch berechnet
   - Andere Spieler sehen andere Geräte

### 5.6 Multi-Bid Pricing (Optional)

Wenn im Szenario aktiviert (`enable_player_bidding = true`):

**3 Gebots-Tranchen pro Gerät:**

| Tranche | Beschreibung | Empfohlene Strategie |
|---------|--------------|----------------------|
| **Bid A** | Grundlast, immer angeboten | Preis = Variable Kosten ×1.0 |
| **Bid B** | Mittlere Auslastung | Preis = Variable Kosten ×1.25 |
| **Bid C** | Spitzenlast, teuer | Preis = Variable Kosten ×1.5 |

**UI-Elemente:**
- Drei Preis-Eingabefelder pro Gerät
- Stacked Area Chart zeigt kumulierte Kapazität
- Farbcodierung: A=Blau, B=Grün, C=Orange

**Merit Order Clearing:**
1. Alle Gebote aller Spieler werden gesammelt
2. Sortierung nach Preis (günstigste zuerst)
3. Markt räumt wo Angebot = Nachfrage
4. **MCP** = Preis des teuersten akzeptierten Gebots
5. Alle dispatched MWh erhalten den MCP (uniform pricing)

**Strategische Überlegungen:**
- Zu hoch bieten → nicht dispatched → kein Umsatz
- Zu niedrig bieten → dispatched aber unter Potential
- Optimal: MCP schätzen und knapp darunter bieten

---

## 6. Märkte verstehen

### 6.1 Day-Ahead (DA) Markt

Der DA-Markt ist der Hauptmarkt für Stromhandel:

| Aspekt | Details |
|--------|---------|
| **Gate-Closure** | 12:00 des Vortags |
| **Lieferfenster** | Kompletter Folgetag (00:00-23:59) |
| **Commitment** | Bindend nach Gate-Closure |
| **Liquidität** | Höchstes Volumen, stabilste Preise |
| **Im Spiel** | Runde 1 legt DA-Position fest |

### 6.2 Intraday (ID) Markt

Der ID-Markt ermöglicht kurzfristige Anpassungen:

| Aspekt | Details |
|--------|---------|
| **Gate-Closure** | Progressiv (6h, 3h, 1h vor Lieferung) |
| **Lieferfenster** | Verbleibende Stunden |
| **Purpose** | Anpassung der DA-Position |
| **Liquidität** | Geringer, volatiler |
| **Im Spiel** | Runden 2+ erlauben ID-Anpassungen |

### 6.3 Balancing (Ausgleichsenergie)

Für Prognosefehler zahlt man Ausgleichskosten:

| Situation | Preis | Bedeutung |
|-----------|-------|-----------|
| **Unterlieferung** | Höherer Preis | Du kaufst teuer vom Grid |
| **Überlieferung** | Niedrigerer Preis | Du verkaufst günstig ans Grid |

**Berechnung:**
```
Imbalance_Cost = |Actual - Dispatched| × Balancing_Price
```

### 6.4 Preisbildung (Market Clearing)

**Market Clearing Price (MCP):**

```
                    Preis
                      ▲
                      │     Supply Curve ↗
                      │            ╱
          MCP ────────┼───────●──╱
                      │      ╱│
                      │     ╱ │
                      │    ╱  │  Demand Curve ↘
                      │   ╱   │
                      └───────┴─────────────────► Menge
                          Equilibrium
```

**MCP = Preis wo Angebot = Nachfrage**

**Einflussfaktoren:**
- Nachfragekurve (synthetisch generiert oder von Consumer-Spielern)
- Angebotskurve (Erzeuger-Geräte + synthetische Erzeuger)
- Events (Kapazitätsausfälle erhöhen MCP, Nachfragespitzen)
- Saisonale Muster (Peak: 08:00, 18:00)

### 6.5 ID Price Spread

Optionaler Preisaufschlag für Intraday-Handel:

```
ID_Price = DA_Price × (1 + id_price_spread_percent / 100)
```

| Spread | Bedeutung | Effekt |
|--------|-----------|--------|
| 0% | Kein Unterschied (Standard) | DA und ID gleichwertig |
| +8% | ID 8% teurer | Anreiz für gute DA-Planung |
| -5% | ID 5% günstiger | Vorteil für späte Anpassung |

**Anzeige**: Badge in Round Results zeigt Spread-Prozentsatz.

### 6.6 Stündliches Market Clearing

Seit Sprint 23 erfolgt das Clearing für **jede Stunde** separat:

- Jede Stunde hat eigenen MCP basierend auf stündlicher Nachfrage
- Rundenresultat zeigt Durchschnitts-MCP
- Ermöglicht realistischere Preisvolatilität

---

## 7. Ergebnisse & Auswertung

### 7.1 KPI-Definitionen

| KPI | Formel | Bedeutung |
|-----|--------|-----------|
| **Revenue** | `Dispatched_MWh × MCP` | Erlös aus Stromverkauf |
| **Variable Cost** | `Dispatched_MWh × Variable_Cost_per_MWh` | Brennstoffkosten |
| **Imbalance Cost** | `\|Actual - Dispatched\| × Balancing_Price` | Ausgleichskosten |
| **Curtailment Cost** | `Curtailed_MWh × Curtailment_Price` | Kosten für Abregelung |
| **Congestion Revenue** | `Transmission_Premium × MW` | Erlös aus Engpassmanagement |
| **Profit** | `Revenue - Variable_Cost - Imbalance_Cost - Curtailment_Cost + Congestion_Revenue` | Gewinn |

### 7.2 DA/ID Breakdown

Nach jeder Runde zeigt das Round Results Modal:

**Vier Summary-Karten:**

| Karte | Beschreibung | Farbe |
|-------|--------------|-------|
| **DA Volume** | Deine Position bei Gate-Closure | Grau |
| **ID Delta** | Änderung durch Intraday-Handel | Grün (+) / Rot (-) |
| **Final Position** | DA + ID = Endposition | Blau |
| **ID Adjustment %** | `(ID Delta / DA Volume) × 100%` | Info |

**Preisanzeige (wenn Spread ≠ 0):**
- DA Price: MCP im Day-Ahead Markt
- ID Price: MCP × (1 + Spread%)
- Spread Badge in Überschrift

**Tägliche Aufschlüsselung:**
- Klicke auf "📅 Daily Breakdown (X days)"
- Tabelle mit DA MWh, ID MWh, Delta, ID Adjustment % pro Tag
- Farbige Chips für signifikante Änderungen (>20%)

### 7.3 Consumer-Ansicht

Wenn du ein Verbraucher-Gerät steuerst:

| Standard-Label | Consumer-Label |
|----------------|----------------|
| DA Volume | DA Einkauf |
| Revenue | Kosten |
| Final Position | Finaler Bedarf |
| Total Revenue | Gesamtkosten |
| ID+ | Mehr Einkauf (Mehrkosten) |
| ID- | Weniger Einkauf (Ersparnis) |

**Visuelle Hinweise:**
- Rosa "Consumer" Badge in der Überschrift
- Info-Alert: "Als Consumer kaufst du Strom..."
- Rosa Hintergrund für Consumer-Karten

### 7.4 Scoring

Dein **Total Score** (0-100) wird berechnet aus gewichteten KPIs:

```
Raw_Score = (Profit × w_profit) - (|Imbalance| × w_imbalance) - (Curtailment × w_curtailment)
Score = normalize(Raw_Score, 0, 100)
```

**Typische Gewichte:**

| KPI | Gewicht | Bedeutung |
|-----|---------|-----------|
| Profit | 60% | Hauptziel |
| Imbalance | 30% | Prognosegenauigkeit |
| Curtailment | 10% | Netzintegration |

### 7.5 Evaluation Page

Die finale Evaluation (`/evaluation?sessionId=...`) zeigt:

1. **Summary KPIs**: Über alle Runden aggregiert
2. **Round Table**: Detaillierte Ergebnisse pro Runde
3. **Trend Charts**: 
   - Profit über Runden
   - MCP über Runden
   - Volume über Runden
4. **Market Breakdown**: DA vs ID Volumen und Revenue
5. **Cohort Comparison**: Deine Werte vs Durchschnitt
6. **Export**: PDF-Download

---

## 8. Tipps & Strategien

### 8.1 Grundlagen

1. **Speichere oft** - Save ist nicht Submit, keine Nachteile
2. **Beobachte den Timer** - Kein Submit nach Ablauf möglich
3. **Achte auf Freeze** - Gefrorene Stunden sind fix
4. **Lies das Briefing** - Events und Regeln verstehen
5. **Nutze den Chart-Editor** - Schneller als Feldbearbeitung

### 8.2 Forecast-Strategien

**Für Erzeuger (positive Volumes):**

| Strategie | Wann | Risiko |
|-----------|------|--------|
| Konservativ (unterschätzen) | Unbekanntes Szenario | Verpasste Revenue |
| Aggressiv (überschätzen) | Hohe MCP erwartet | Hohe Imbalance-Kosten |
| Ramping beachten | Schnelle Änderungen | Physikalisch unmöglich |

**Für Erneuerbare (Solar/Wind):**
- Nutze Wetter-Prognosen im Briefing
- Capacity Factor berücksichtigen
- Tageszeit-Profile einplanen (Solar: Peak 12:00)

**Für Verbraucher (negative Volumes):**

| Strategie | Wann | Risiko |
|-----------|------|--------|
| Überschätzen | Sicherheit | Mehr Kosten |
| Demand Response | Hohe Preise | Komfortverlust |
| Flexibel bleiben | Volatiler Markt | Komplexität |

### 8.3 Multi-Bid Strategien

1. **Start konservativ**: Bid A nahe Variable Costs
2. **MCP beobachten**: Historical MCP Chart analysieren
3. **Portfolio nutzen**: Günstige Geräte (Solar/Wind) aggressiv niedrig bieten
4. **Risiko balancieren**: Höhere Preise = höherer Gewinn ODER Ablehnung
5. **Bid C als Hedge**: Nur bei Spitzennachfrage dispatched

### 8.4 DA vs ID Optimierung

| Situation | Strategie |
|-----------|-----------|
| ID teurer (Spread > 0) | DA-Planung maximieren |
| ID günstiger (Spread < 0) | Flexibilität nutzen |
| Unerwartetes Event | ID-Anpassung nutzen |
| Stabiles Wetter | DA-Commitment höher |

### 8.5 Event-Management

| Event-Typ | Reaktion |
|-----------|----------|
| Kraftwerksausfall | Andere Erzeuger hochfahren |
| Nachfragespitze | Höhere Preise → mehr bieten |
| Netzengpass | Zonenabhängig anpassen |
| Wetterextrem | Solar/Wind Forecast korrigieren |

---

## 9. Troubleshooting

### 9.1 Häufige Probleme

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Kann nicht submitten | Timer abgelaufen | Warte auf nächste Runde |
| Kann nicht submitten | Session pausiert | Trainer muss fortsetzen |
| Kann nicht submitten | Player Type fehlt | Wähle einen Player Type |
| Keine Charts | Erstes Clearing ausstehend | Warte auf Rundenende |
| Verbindung verloren | WebSocket getrennt | Seite neu laden |
| Forecast nicht gespeichert | Fehler bei Save | Erneut Save klicken |
| Falsche Werte | Geräte-Constraints | Werte anpassen (Min/Max) |

### 9.2 Error Messages

| Meldung | Bedeutung | Lösung |
|---------|-----------|--------|
| "Session not found" | Session-ID ungültig | Zum Home navigieren |
| "Not authorized" | Kein Zugang | Trainer kontaktieren |
| "Round already submitted" | Bereits abgegeben | Warte auf nächste Runde |
| "Validation failed" | Constraints verletzt | Werte prüfen |
| "Time expired" | Zu spät | Nächste Runde nutzen |

### 9.3 Browser-Kompatibilität

**Empfohlen:**
- Chrome (neueste Version)
- Firefox (neueste Version)
- Edge (neueste Version)

**Nicht unterstützt:**
- Internet Explorer
- Safari (eingeschränkt)

---

## 10. Glossar

| Begriff | Definition |
|---------|------------|
| **ATC** | Available Transfer Capacity - Übertragungskapazität zwischen Zonen (MW) |
| **Balancing** | Ausgleichsenergie für Prognosefehler |
| **Capacity Factor** | Durchschnittliche Auslastung erneuerbarer Energien (%) |
| **Curtailment** | Abregelung von Erzeugung wegen Netzüberlastung |
| **DA** | Day-Ahead - Markt für Folgetag-Lieferung |
| **Dispatch** | Tatsächlich abgerufene/gelieferte Menge (MWh) |
| **DRM** | Demand Response Management - Laststeuerung |
| **Freeze** | Einfrieren bereits abgerechneter Stunden |
| **Gate Closure** | Handelsschluss für einen Markt (z.B. 12:00) |
| **ID** | Intraday - Markt für kurzfristige Anpassungen |
| **Imbalance** | Differenz zwischen Dispatch und tatsächlicher Menge |
| **MCP** | Market Clearing Price - Marktpreis (ZAR/MWh) |
| **Merit Order** | Sortierung der Gebote nach Preis (günstigste zuerst) |
| **MW** | Megawatt - Einheit für Leistung |
| **MWh** | Megawattstunden - Einheit für Energie (1 MW × 1h) |
| **Ramping** | Änderungsrate der Leistung (MW/h) |
| **Round Span** | Simulierte Stunden pro Spielrunde |
| **SAWEM** | South African Wholesale Electricity Market |
| **ZAR** | South African Rand (Währung) |

---

## Support

- **Technische Fragen**: support@emsg.example.com
- **Trainer/Admin**: Über deinen Kohorten-Kontakt
- **In-Game Docs**: `/docs/player` (DocsFab Button rechts unten)

---

*Letzte Aktualisierung: 23. Dezember 2025*

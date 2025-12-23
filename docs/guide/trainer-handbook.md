# Trainer Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 2.0 (Sprint 24)  
**Date**: 23. Dezember 2025  
**Audience**: Trainers/Facilitators

---

## Inhaltsverzeichnis

1. [Einführung](#1-einführung)
2. [Kohorten-Management](#2-kohorten-management)
3. [Session starten](#3-session-starten)
4. [Session steuern](#4-session-steuern)
5. [Live-Monitoring](#5-live-monitoring)
6. [Kommunikation](#6-kommunikation)
7. [Auswertung & Reporting](#7-auswertung--reporting)
8. [Replay-Funktion](#8-replay-funktion)
9. [Best Practices](#9-best-practices)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Einführung

### Rolle des Trainers

Als Trainer bist du verantwortlich für:
- Verwaltung von Kohorten (Spielergruppen)
- Starten und Steuern von Sessions
- Live-Monitoring während des Spiels
- Auswertung und Debriefing

### Navigation

| Route | Funktion |
|-------|----------|
| `/cohorts` | Kohorten- und Kampagnen-Management |
| `/trainer` | Session-Steuerung und Live-Monitoring |
| `/comparison?sessionId=...` | Cross-Player Vergleich |
| `/leaderboard?sessionId=...` | Ranking |
| `/replay?sessionId=...` | Rundenweise Wiedergabe |
| `/evaluation?sessionId=...` | Finale Auswertung |

### Workflow-Übersicht

```
1. Vorbereitung
   ├── Kohorte erstellen
   ├── Spieler einladen
   └── Kampagnen aktivieren

2. Session durchführen
   ├── Szenario auswählen
   ├── Player Types konfigurieren
   ├── Session starten
   ├── Live überwachen
   └── Session beenden

3. Nachbereitung
   ├── Auswertung analysieren
   ├── Leaderboard zeigen
   └── Debriefing durchführen
```

---

## 2. Kohorten-Management

### 2.1 Kohorte erstellen

**Route**: `/cohorts` → "Neue Kohorte"

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| **Name** | Eindeutiger Kohortenname | "WS 2025 Gruppe A" |
| **Beschreibung** | Optional, interne Notizen | "Dienstagskurs" |

### 2.2 Mitglieder verwalten

**Spieler hinzufügen:**

| Methode | Beschreibung |
|---------|--------------|
| **E-Mail** | Einzelne E-Mail-Adresse eingeben |
| **CSV-Import** | Liste von E-Mails hochladen |
| **Einladungslink** | Link teilen, Spieler registrieren sich selbst |

**Spieler entfernen:**
- Klick auf ✕ neben dem Spieler
- ⚠️ Spieler verliert Zugang zu allen Sessions der Kohorte

### 2.3 Kampagnen aktivieren

**Kampagnen-Tab:**

| Spalte | Beschreibung |
|--------|--------------|
| **Kampagne** | Name der Kampagne |
| **Sichtbar** | Im Catalog für diese Kohorte sichtbar |
| **Aktiv** | Sessions können gestartet werden |

**Aktionen:**
- Toggle "Sichtbar" → Spieler sehen Kampagne im Catalog
- Toggle "Aktiv" → Trainer kann Sessions starten
- Klick auf Kampagne → Zeigt Szenarien

### 2.4 Session-Historie

**Sessions-Tab:**
- Liste aller vergangenen Sessions
- Status, Startzeit, Teilnehmer
- Links zu Evaluation, Replay, Leaderboard

---

## 3. Session starten

### 3.1 Session-Start Workflow

**Route**: `/trainer` oder `/cohorts` → Kampagne → Szenario → "Session starten"

**Schritt 1: Kohorte wählen**
- Dropdown zeigt verfügbare Kohorten
- ⚠️ Warnung wenn Kohorte bereits aktive Session hat

**Schritt 2: Kampagne wählen**
- Nur veröffentlichte, für Kohorte aktive Kampagnen
- Kampagnenbild und -beschreibung angezeigt

**Schritt 3: Szenario wählen**
- Liste der Szenarien in der Kampagne
- Nur "Kohorten-fähige" Szenarien
- Objectives-Preview (erste 200 Zeichen)

**Schritt 4: Player Types konfigurieren**

| Einstellung | Beschreibung |
|-------------|--------------|
| **Typ aktivieren** | Toggle pro Player Type |
| **Max. Spieler** | Wie viele Spieler diesen Typ wählen können |

**Schritt 5: Session starten**
- Klick auf "Start Scenario"
- Session wird erstellt im Status "Created"
- Spieler können beitreten und Briefing sehen

### 3.2 Session-Modi

| Modus | Beschreibung | Markt |
|-------|--------------|-------|
| **Shared Market** | Alle Trainer-Sessions | Gemeinsamer Markt |

ℹ️ Solo-Modus wird direkt von Spielern via Catalog gestartet.

### 3.3 Automatischer Start

Nach Session-Erstellung:
1. Spieler treten bei (sehen Briefing)
2. Trainer klickt "Run" → Session startet
3. Timer beginnt für alle Spieler gleichzeitig

---

## 4. Session steuern

### 4.1 Session-Status

| Status | Farbe | Bedeutung |
|--------|-------|-----------|
| **Created** | Grau | Session erstellt, noch nicht gestartet |
| **Running** | Grün | Session läuft, Timer aktiv |
| **Paused** | Gelb | Session pausiert, Timer gestoppt |
| **Ended** | Rot | Session beendet, Evaluation verfügbar |

### 4.2 Steuerungselemente

**Trainer Dashboard** (`/trainer`):

```
┌─────────────────────────────────────────────────────────────┐
│  Session Info: Kohorte | Szenario | Status | Runde N/M      │
├─────────────────────────────────────────────────────────────┤
│  [▶ Run]  [⏸ Pause]  [⏹ End]  [⏭ Force Round End]         │
└─────────────────────────────────────────────────────────────┘
```

| Button | Funktion | Wann nutzen |
|--------|----------|-------------|
| **▶ Run** | Session starten/fortsetzen | Nach Created oder Paused |
| **⏸ Pause** | Timer stoppen | Für Erklärungen, Pausen |
| **⏹ End** | Session beenden | Nach letzter Runde oder Abbruch |
| **⏭ Force Round End** | Runde sofort beenden | ⚠️ Notfall, überspringt Timer |

### 4.3 Runden-Management

**Automatischer Rundenablauf:**
1. Timer läuft (z.B. 300s)
2. Spieler submitten Forecasts
3. Timer endet → Market Clearing
4. Round Results werden angezeigt
5. Spieler signalisieren "Ready"
6. Wenn alle Ready → Nächste Runde

**Manuelles Eingreifen:**
- "Force Round End" → Überspringt wartende Spieler
- Nur nutzen wenn Spieler technische Probleme haben

### 4.4 Session beenden

**Normales Ende:**
- Nach letzter Runde automatisch
- Spieler sehen Scenario Results
- Weiterleitung zu Evaluation

**Vorzeitiges Ende:**
- "End" Button → Session sofort beenden
- Alle bisherigen Ergebnisse bleiben erhalten
- Spieler werden zu Evaluation weitergeleitet

---

## 5. Live-Monitoring

### 5.1 Dashboard-Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Session Info Bar                                              │
├──────────────────────┬─────────────────────────────────────────┤
│                      │                                         │
│  Presence Panel      │        Status Matrix                    │
│  (Online/Offline)    │        (Player × Status)                │
│                      │                                         │
├──────────────────────┼─────────────────────────────────────────┤
│                      │                                         │
│  Type Distribution   │        Market Charts                    │
│  (Pie Chart)         │        (MCP, Volume)                    │
│                      │                                         │
├──────────────────────┴─────────────────────────────────────────┤
│  Aggregated KPIs Table                                         │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 Presence Panel

Zeigt Online-Status aller Spieler:

| Symbol | Status |
|--------|--------|
| 🟢 | Online, aktiv |
| 🟡 | Online, inaktiv (>1 Min) |
| 🔴 | Offline |

**Automatisches Refresh**: Alle 5 Sekunden

### 5.3 Status Matrix

Detaillierte Übersicht pro Spieler:

| Spalte | Beschreibung |
|--------|--------------|
| **Spieler** | E-Mail oder Name |
| **Typ** | Gewählter Player Type |
| **Online** | Verbindungsstatus |
| **Forecasted** | Forecast erstellt? |
| **Submitted** | Diese Runde submitted? |
| **Ready** | Bereit für nächste Runde? |
| **Letzte Aktivität** | Zeitstempel |

**Farbcodierung:**
- 🟢 Grün: Aktiv spielend
- 🟡 Gelb: Verbunden, aber nicht aktiv
- ⬜ Weiß: Nicht verbunden

### 5.4 Type Distribution

Kreisdiagramm zeigt:
- Wie viele Spieler jeden Player Type gewählt haben
- Verbleibende Slots pro Typ
- Hilfreich für Balance-Prüfung

### 5.5 Device Frequency

Balkendiagramm zeigt:
- Wie oft jedes Gerät gewählt wurde
- Identifiziert beliebte/unbeliebte Geräte

### 5.6 Market Charts

**MCP über Runden:**
- Grüne Linie
- Zeigt Preisentwicklung
- Tooltips mit Werten

**Volume über Runden:**
- Blaue Linie
- Gesamtes Handelsvolumen

**Export:** PNG/SVG

### 5.7 Aggregated KPIs

Tabelle mit allen Spielern:

| Spalte | Beschreibung |
|--------|--------------|
| **Spieler** | Name/E-Mail |
| **Typ** | Player Type |
| **Profit** | Gesamt-Profit (ZAR) |
| **Revenue** | Gesamt-Erlöse (ZAR) |
| **Imbalance** | Gesamt-Imbalance-Kosten |
| **Curtailment** | Gesamt-Abregelungskosten |
| **Runden** | Anzahl gespielter Runden |

**Aktionen:**
- Sortieren nach jeder Spalte
- Export als CSV

### 5.8 Event Log

Chronologische Liste aller Ereignisse:

| Event-Typ | Beispiel |
|-----------|----------|
| Session | "Session gestartet", "Runde 3 beendet" |
| Player | "player@email.com joined", "Forecast submitted" |
| Market | "MCP = 450 ZAR/MWh", "Clearing completed" |

**Filter:**
- Nach Event-Typ
- Nach Spieler
- Nach Zeitraum

---

## 6. Kommunikation

### 6.1 Broadcast-Nachrichten

Sende Nachrichten an alle Spieler:

1. Eingabefeld im Trainer Dashboard
2. Nachricht eingeben
3. "Send" klicken
4. Alle Spieler sehen Toast-Notification

**Beispiele:**
- "5 Minuten bis Rundenende!"
- "Beachtet das Koeberg-Event in Runde 3"
- "Pause für Fragen"

### 6.2 Player-spezifische Kommunikation

Derzeit nicht implementiert. Workaround:
- E-Mail direkt senden
- Chat-Tool parallel nutzen (Teams, Slack)

---

## 7. Auswertung & Reporting

### 7.1 Comparison Dashboard

**Route**: `/comparison?sessionId=...`

Vergleich aller Spieler:

| Element | Beschreibung |
|---------|--------------|
| **Metric Filter** | Wähle KPI (Profit, Imbalance, etc.) |
| **Bar Chart** | Visuelle Darstellung pro Spieler |
| **Table** | Detaillierte Zahlen |

**Export:** PNG/CSV

### 7.2 Leaderboard

**Route**: `/leaderboard?sessionId=...`

Ranking nach Scoring-Regeln:

| Element | Beschreibung |
|---------|--------------|
| **Platzierung** | 1, 2, 3, ... |
| **Spieler** | Name/E-Mail |
| **Score** | Total Score (0-100) |
| **Breakdown** | Einzelne KPIs |

**Optionen:**
- Metrik wählen
- Pro Role filtern
- PDF-Export

### 7.3 Evaluation

**Route**: `/evaluation?sessionId=...`

Vollständige Auswertung:

| Abschnitt | Inhalt |
|-----------|--------|
| **Summary KPIs** | Aggregiert über alle Runden |
| **Round Table** | Details pro Runde |
| **Trend Charts** | Profit, MCP, Volume über Zeit |
| **Market Breakdown** | DA vs ID Volumen/Revenue |
| **Cohort Comparison** | Spieler vs Durchschnitt |

**Export:** PDF

### 7.4 DA/ID Market Breakdown

Neue Funktion (Sprint 24):

| Metrik | Beschreibung |
|--------|--------------|
| **DA Volume** | Im Day-Ahead committed |
| **ID Delta** | Intraday-Anpassungen |
| **Final Position** | Endposition |
| **ID Adjustment %** | Prozentuale Änderung |

**Pädagogischer Wert:**
- Zeigt Trading-Aktivität
- Identifiziert "Nachjustierer"
- Diskussionsgrundlage für Debriefing

---

## 8. Replay-Funktion

### 8.1 Replay starten

**Route**: `/replay?sessionId=...`

### 8.2 Navigation

| Button | Funktion |
|--------|----------|
| **⏮** | Zur ersten Runde |
| **◀** | Vorherige Runde |
| **▶** | Nächste Runde |
| **⏭** | Zur letzten Runde |
| **⏯** | Autoplay Start/Stop |

### 8.3 Anzeige pro Runde

- Submitted Forecasts aller Spieler
- Market Clearing Ergebnisse
- MCP und Volume
- Aktive Events

### 8.4 Overlays

| Overlay | Beschreibung |
|---------|--------------|
| **Cohort Average** | Durchschnitt aller Spieler |
| **Reference Run** | Vom Designer hochgeladene Referenz |

### 8.5 Export

- Rundenweise Screenshots
- Daten als CSV

---

## 9. Best Practices

### 9.1 Vorbereitung

| Aufgabe | Timing |
|---------|--------|
| Kohorte erstellen | 1 Woche vorher |
| Spieler einladen | 1 Woche vorher |
| Test-Session | 1-2 Tage vorher |
| Briefing-Material | Tag vorher |

### 9.2 Während der Session

| Tipp | Begründung |
|------|------------|
| **Timer ankündigen** | "Noch 2 Minuten!" |
| **Pause bei Fragen** | Verständnis sichern |
| **Status-Matrix beobachten** | Probleme früh erkennen |
| **Nicht zu oft eingreifen** | Lernerfahrung lassen |

### 9.3 Debriefing

| Element | Beschreibung |
|---------|--------------|
| **Leaderboard zeigen** | Motivation, Vergleich |
| **Top-Performer interviewen** | "Was war deine Strategie?" |
| **Fehler diskutieren** | "Was lief schief bei Spieler X?" |
| **Marktdynamik erklären** | MCP-Entwicklung besprechen |
| **DA vs ID analysieren** | Wer hat gut geplant? |

### 9.4 Häufige Situationen

| Situation | Reaktion |
|-----------|----------|
| Spieler kommt zu spät | Nächste Runde abwarten |
| Technische Probleme | Pause, Problem lösen |
| Fragen während Spiel | Kurze Antwort, Details später |
| Ungleiche Teams | Kapazitäten in Player Types anpassen |

---

## 10. Troubleshooting

### 10.1 Häufige Probleme

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Session startet nicht | Aktive Session existiert | Alte Session beenden |
| Spieler sieht Session nicht | Nicht in Kohorte | Kohorte prüfen |
| Timer läuft nicht | Session "Created" | "Run" klicken |
| Keine Ergebnisse | Kein Submit | Force Round End |
| Verbindung instabil | WebSocket-Problem | Seite neu laden |

### 10.2 Notfall-Aktionen

| Aktion | Wann |
|--------|------|
| **Force Round End** | Spieler kann nicht submitten |
| **Pause** | Technisches Problem für alle |
| **End Session** | Kritischer Fehler, Neustart nötig |

### 10.3 Support kontaktieren

- **Technisch**: support@emsg.example.com
- **Logs**: Trainer Dashboard → Event Log exportieren
- **Screenshots**: Status Matrix, Error Messages

---

## Anhang: API-Referenz

### Wichtige Endpoints

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/sessions` | POST | Session erstellen |
| `/api/sessions/:id/start` | POST | Session starten |
| `/api/sessions/:id/pause` | POST | Session pausieren |
| `/api/sessions/:id/end` | POST | Session beenden |
| `/api/sessions/:id/broadcast` | POST | Nachricht senden |
| `/api/trainer/presence` | GET | Online-Status aller Spieler |

### WebSocket Events

| Event | Richtung | Beschreibung |
|-------|----------|--------------|
| `session:status` | Server→Client | Status-Update |
| `round:end` | Server→Client | Runde beendet |
| `player:submit` | Server→Client | Spieler hat submitted |
| `broadcast` | Server→Client | Trainer-Nachricht |

---

*Letzte Aktualisierung: 23. Dezember 2025*

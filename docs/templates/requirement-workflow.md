# EMSG Requirement Workflow Template

Nutzen Sie diesen Prompt für jede neue Anforderung im Energy Market Simulation Game Projekt.

---

## Prompt Template (kopieren und verwenden)

```
NEUE ANFORDERUNG für EMSG:

<Beschreiben Sie hier Ihre Anforderung>

---

Bitte führen Sie den folgenden Workflow aus:

## 1. KLÄRUNG DER ANFORDERUNG
- Analysieren Sie die Anforderung und identifizieren Sie alle Unklarheiten
- Stellen Sie maximal EINE Klärungsfrage auf einmal
- Bei mehreren Teil-Anforderungen: Zerlegen Sie diese (R1, R2, R3, ...)
- Prüfen Sie Abhängigkeiten zu bestehender Funktionalität

## 2. KATEGORISIERUNG
Entscheiden Sie anhand folgender Kriterien:

### → OPEN ISSUE (docs/open-issues.md)
Falls EINES dieser Kriterien zutrifft:
- Bug oder Fehlfunktion in bestehender Funktionalität
- Kritischer Blocker, der sofortige Umsetzung erfordert
- Bereits teilweise implementiert, aber nicht funktionsfähig
- Behindert aktuelle Arbeitsabläufe oder Tests

### → BACKLOG (docs/backlog.md)
Falls ALLE diese Kriterien zutreffen:
- Neue Funktionalität oder Enhancement
- Nicht kritisch/blockierend für aktuellen Sprint
- Benötigt möglicherweise weitere Planung/Design
- Kann in zukünftigem Sprint umgesetzt werden

## 3. UMSETZUNG (bei OPEN ISSUE)

### 3a. Informationen sammeln
- Prüfen Sie relevante Code-Dateien
- Analysieren Sie bestehende Implementierung
- Identifizieren Sie Root Cause

### 3b. Klärende Fragen (falls nötig)
Stellen Sie ALLE benötigten Fragen auf einmal:
- Technische Entscheidungen
- UI/UX Details
- Business Logic
- Prioritäten

### 3c. Implementierung durchführen
- Erstellen Sie einen Todo-Plan mit manage_todo_list
- Implementieren Sie die Lösung Schritt für Schritt
- Testen Sie die Änderungen
- Validieren Sie mit get_errors

## 4. DOKUMENTATION

Aktualisieren Sie ALLE relevanten Dateien:

### Pflicht-Updates:
- **log.md**: Fügen Sie Eintrag hinzu (Datum, Was, Warum, Dateien)
- **docs/open-issues.md** ODER **docs/backlog.md**: 
  - Bei Open Issue: Als RESOLVED markieren mit Lösung
  - Bei Backlog: Neuen Eintrag mit Priorität (P0/P1/P2)

### Bedingte Updates:
- **docs/concept.md**: Falls Konzept-Änderung nötig
- **docs/plan.md**: Falls Plan-Anpassung erforderlich
- **delta.md**: Falls Scope-Änderung zu ursprünglichem Plan
- **README.md**: Falls neue Features für User sichtbar
- **REQUIREMENTS_CHECK.md**: Falls MVP-Anforderungen betroffen

## 5. ERGEBNISBERICHT

Erstellen Sie einen strukturierten Bericht:

### Zusammenfassung
- Anforderung(en): [R1, R2, ...]
- Kategorisierung: [Open Issue | Backlog]
- Status: [Umgesetzt | Dokumentiert | Geplant]

### Details pro Anforderung (R1, R2, ...)
- **Assessment**: [neu | teilweise vorhanden | bereits implementiert | konfliktierend]
- **Evidenz**: Betroffene Dateien/Zeilen/Routes
- **Konzept-Impact**: [ja/nein] + Details
- **Priorität**: [urgent | next | planned | out-of-scope]
- **Implementierung**: [Schritte + betroffene Dateien]
- **Acceptance Criteria**: [Testbare Kriterien]

### Änderungen
- **Code-Dateien**: Liste aller geänderten Dateien
- **Dokumentation**: Aktualisierte .md Dateien
- **Tests**: Neue/geänderte Tests (falls vorhanden)

## 6. TESTBARE LINKS

Generieren Sie Links für:
- **Backend-Endpoints**: `http://localhost:5000/api/...` (alle betroffenen)
- **Frontend-Pages**: `http://localhost:5173/...` (alle betroffenen Routen)
- **Testanweisungen**: Schritt-für-Schritt zum Testen
- **Cypress-Tests**: Relevante Test-Dateien (falls vorhanden)

### Test-Szenarien
Für jede Änderung:
1. **Manueller Test**: Genaue Schritte
2. **Erwartetes Ergebnis**: Was sollte passieren
3. **Validierung**: Wie Erfolg überprüfen

---

WICHTIG:
- Bei Open Issues: Sofort umsetzen und lösen
- Bei Backlog: Nur dokumentieren, NICHT implementieren
- Alle Dokumentation MUSS aktualisiert werden
- Ergebnisbericht MUSS testbare Links enthalten
```

---

## Beispiel-Nutzung

### Beispiel 1: Bug Report
```
NEUE ANFORDERUNG für EMSG:

Wenn ich als Trainer eine Session starte, wird die Startzeit nicht korrekt angezeigt.

[Der Rest des Prompts wird automatisch eingefügt]
```

### Beispiel 2: Feature Request
```
NEUE ANFORDERUNG für EMSG:

Ich möchte als Admin einen Export aller Spielerdaten im CSV-Format.

[Der Rest des Prompts wird automatisch eingefügt]
```

### Beispiel 3: Mehrere Anforderungen
```
NEUE ANFORDERUNG für EMSG:

1. Der "Zurück" Button auf der Player-Seite führt zur falschen Seite
2. Ich möchte im Catalog Filter nach Schwierigkeitsgrad
3. Die Leaderboard-Sortierung funktioniert nicht

[Der Rest des Prompts wird automatisch eingefügt]
```

---

## Workflow-Diagramm

```
Neue Anforderung
     ↓
Klärung (Fragen stellen)
     ↓
Kategorisierung
     ├─→ OPEN ISSUE ─→ Sofort umsetzen ─→ Dokumentieren ─→ Bericht
     └─→ BACKLOG ────→ Nur dokumentieren ──────────────→ Bericht
```

---

## Checkliste für vollständigen Durchlauf

- [ ] Anforderung geklärt (alle Fragen beantwortet)
- [ ] Kategorisierung erfolgt (Open Issue vs. Backlog)
- [ ] Bei Open Issue: Code implementiert
- [ ] Bei Open Issue: Implementierung getestet
- [ ] log.md aktualisiert
- [ ] open-issues.md ODER backlog.md aktualisiert
- [ ] Weitere relevante Docs aktualisiert
- [ ] Ergebnisbericht erstellt
- [ ] Testbare Links/Anweisungen bereitgestellt

---

## Hinweise

1. **Immer den kompletten Prompt nutzen**: Kopieren Sie den gesamten Template-Abschnitt
2. **Eine Anforderung nach der anderen**: Bei mehreren Anforderungen nacheinander abarbeiten
3. **Nicht abkürzen**: Alle Schritte sind wichtig für Konsistenz
4. **Tests sind Pflicht**: Jede Änderung muss testbar sein
5. **Dokumentation vor Commit**: Alle Docs müssen aktualisiert sein

---

Last Updated: 2025-11-17

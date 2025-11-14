# Sprint 14 Plan - KSE UX Konsolidierung & Marktmodellierung

Date: 2025-11-14
Focus: KSE Editor UX, Import/Export, Vorschau-Konsolidierung, realistischere Marktmodelle
Estimated Duration: 5–7 Tage

---

## Sprint Goal

- UX der KSE-Seite vereinfachen (Toolbar + Modals, konsolidierte Parameter+Preview)
- Marktmodell realitätsnäher machen (seed-basierte Streuung, Tages-/Jahresprofile)
- Bestehende Matrix-Bearbeitung konsistent über Toolbar-Trigger nutzbar machen

---

## Stories (Selected)

1) KSE – Save/Import in Modal (Backlog #32)
Priority: HIGH | Complexity: M

Problem:
Dauerhafter IO-Bereich stört den Editorfluss.

Scope:
- Frontend: Toolbar-Button „Import/Export“; `ScenarioIODialog` mit Tabs Save/Export und Import (JSON Upload, Schema-Validierung, Download Export), Schema-Versionierung (`config.version`, semver) inkl. Migrationshinweisen.
- Modal-UX: zentriert, maxWidth="md", ScrollPaper, Enter/ESC, Fokus-Trap
- Tests: Cypress-Flows für Import valid/invalid, Version mismatch Hinweis, Export

Acceptance:
- Modal öffnet/schließt korrekt (ESC/Enter), Fokus-Trap
- Import validiert Schema; kein Zustandsverlust bei Fehler
- Export liefert korrekte JSON

2) KSE – Szenario-Beschreibung per Modal editieren (Backlog #33)
Priority: HIGH | Complexity: S

Scope:
- Frontend: Toolbar-Button „Edit Description“ → `ScenarioDescriptionDialog` (Markdown + Live-Preview, Tabs oder Split)
- Persistenz: `config.general.description` (max 2000 Zeichen)
- Modal-UX: zentriert, maxWidth="sm|md", Enter/ESC, Fokus-Trap

Acceptance:
- Speichern/Abbrechen/ESC/Enter wie erwartet
- Beschreibung aktualisiert in Briefing und Catalog-Ansichten

3) KSE – „Edit Matrix“ als Modal konsolidieren (Backlog #34)
Priority: MEDIUM | Complexity: M

Scope:
- Frontend: Einheitlicher Toolbar-Button → Fullscreen `AtcEditor` (bestehend), CSV Import/Export, Symmetrie-Lock, Undo/Redo (>=10)
- Doku/Tooltip im Dialog

Acceptance:
- Öffnen/Speichern/Abbrechen, CSV-Errors mit Zeile/Spalte
- Tastatur: Ctrl+S speichert, ESC schließt

4) KSE – Market+Environment+Preview zusammenführen (Backlog #35)
Priority: HIGH | Complexity: M-L

Scope:
- Frontend: Neue kombinierte Ansicht (zweispaltig: links Parameter, rechts sticky Preview), Live-Update (debounce 250–500ms)
- Entfernt separate Tabs; passt Routing/State an
- E2E-Updates (KSE Flows)

Acceptance:
- Keine Datenverluste; Preview reagiert <500ms
- Kein horizontaler Scroll ≥1280px; A11y OK

5) Engine – Teilnehmer-Streuung per Seed (Backlog #36)
Priority: HIGH | Complexity: M

Scope:
- Backend: Seed-basierte RNG; getrennte Prozentsätze je Typ: `capacity_variability_pct`, `marginal_cost_variability_pct`; Seed-Quelle: `campaign.seed` (Fallback Preview-Seed nur in KSE)
- Frontend: Je Typ zwei Felder „Capacity variability (%)“ und „Marginal cost variability (%)“
- Preview reflektiert Streuung

Acceptance:
- Gleicher Seed ⇒ identische Generierung
- 0% ⇒ Status quo; Performance ≤50ms/1k Teilnehmer

6) Engine – Tages-/Jahresverlauf (Backlog #37)
Priority: MEDIUM | Complexity: M

Scope:
- Backend: Diurnale Profile (24), saisonale Faktoren (12); Nachfrage(t)=Basis×Diurnal×Seasonal
- Frontend: Presets (Winter/Sommer/Werktag/Wochenende) und JSON-Import (kein freies UI-Editing notwendig)
- Preview: 24h Mini-Chart

Acceptance:
- Datum/Uhrzeit beeinflusst Muster; Presets validiert
- Engine liefert reproduzierbar gleiche Ergebnisse

---

## Implementation Order

1) Toolbar + IO-Modal (Story 1)
2) Description-Modal (Story 2)
3) Toolbar-Trigger für AtcEditor (Story 3)
4) Konsolidierte Market+Environment+Preview (Story 4)
5) Seed-basierte Streuung (Story 5)
6) Diurnal/Seasonal-Profile (Story 6)

---

## Dependencies & Notes

- `components/grid/AtcEditor.jsx` existiert (Sprint 11) – nur Trigger/Konventionen vereinheitlichen
- Seed-Feld existiert in `config.general.seed` (falls nicht: hinzufügen)
- Debounce für Preview-Updates, um Reflow zu minimieren
- A11y/KBD: ESC/Enter, Fokus-Traps in allen Dialogen

---

## Testing

- Cypress:
  - e2e/kse-devices.cy.js (anpassen)
  - e2e/kse-import.cy.js (NEU): Import/Export/Validation
  - e2e/kse-preview.cy.js (NEU): Live-Update und konsolidierte Ansicht
- Unit:
  - Engine-Profile/Seed-Variabilität deterministisch testen (gleicher Seed ⇒ gleiche Serie)

---

## Success Metrics

- 0 kritische A11y-Issues (Axe)
- Preview-Update <500ms bei Parameteränderung
- Engine-Generierung ≤50ms/1k Teilnehmer
- Cypress grün für neue/aktualisierte Flows

---

## Out of Scope

- Forecast Chart Editor (UC-21) – bleibt außerhalb dieses Sprints
- WebSocket-Livevorschau – Polling reicht für diesen Sprint

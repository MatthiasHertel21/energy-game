# Sprint 18 Plan – KSE Polish

Date: 2025-11-14
Duration: 5 working days
Branch: feature/catalog-campaigns

## Goal
Close KSE UX/Preview issues (#3–#16 in `docs/open-issues.md`) and improve overall editor usability.

## Scope
- #3: Market&Preview Kurven monoton + Step‑Chart (Engine Preview + FE)
- #4: Doppelte Tabs → untere Leiste entfernen
- #5: General spacing/grouping, XS/SM Inputs; Player Zones → Grid
- #6: Apply Profiles Info‑Popup (diurnal/seasonal JSON)
- #7: Chart Clipping/Domain fix
- #8: Teilnehmer‑Aufteilung (Tabelle mit %‑Sliders + Inputs)
- #9: Market Basics → General (base_price, base_volume_mwh, price_floor, price_cap)
- #10: Zahlenfelder XS/SM, HelperText nur unten
- #11: Preview‑Buttons rechtsbündig; Icons (Reload/Calculate)
- #12: Chart‑Zoom Modal mit tabellarischen Daten unten
- #13: Grid Matrix inline (kein Modal/CSV), Symmetry‑Lock
- #14: Player Types zweispaltig (Liste links, Devices rechts)
- #15: Usage Tab weißer Bildschirm fix (ErrorBoundary + Fallback)
- #16: Toolbar rechtsbündig; Save rechts; „Validate + Preview“ entfernen; Tab „Description“

## Work Breakdown
- Day 1: #4, #16, #11
- Day 2: #3, #7, #10
- Day 3: #9, #5, #6
- Day 4: #13, #12
- Day 5: #8, #14, #15

## Testing
- Cypress: Tabs/Nav (eine Leiste), Monotonie‑Preview, Chart‑Modal, Grid inline Matrix, Player Types 2‑Spalten, Usage Tab render
- Unit: Engine preview monotonicity check

## Definition of Done
- Issues #3–#16 geschlossen
- Cypress grün; axe keine kritischen Fehler
- UI entspricht den vereinbarten Layouts (Tabs/Toolbar/Inputs)

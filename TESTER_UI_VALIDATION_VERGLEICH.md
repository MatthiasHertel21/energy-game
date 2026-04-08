# Tester UI Validation Vergleich

## Ziel

Kurzer Vergleich der zwei vollstaendigen Live-Reproduktionslaeufe fuer das Scenario `Tester`.

## Vergleich der Laeufe

| Merkmal | Lauf 1 | Lauf 2 |
| --- | --- | --- |
| Seed-Tag | `40a9fc58` | `d0637c27` |
| Campaign ID | `4` | `6` |
| Scenario | `Tester` | `Tester` |
| Runden | `4` | `4` |
| Player-Typen | `3` | `3` |
| Validierte Werte | `10221` | `10221` |
| Numeric Checks | `2976` | `2976` |
| Equality Checks | `897` | `897` |
| Bounds Checks | `1` | `1` |
| Existence Checks | `35` | `35` |
| Finiteness Checks | `6312` | `6312` |

## Player-Vergleich

| Player-Typ | Lauf 1 gesamt | Lauf 2 gesamt | Checks pro Runde | Final-Checks |
| --- | --- | --- | --- | --- |
| Classic Provider | `3285` | `3285` | `805` | `65` |
| Municipal Consumer | `3285` | `3285` | `805` | `65` |
| PV Bat Player | `3649` | `3649` | `896` | `65` |

## Ergebnis

Die beiden frischen Live-Laeufe sind fachlich deckungsgleich.

- gleicher Validierungsumfang
- gleicher Zaehler der fachlich/rechnerisch geprueften Werte
- gleiche Verteilung ueber Kategorien
- gleiche Verteilung ueber Player-Typen und Runden

Damit ist die Tester-Validierung im aktuellen Stand reproduzierbar.

## Artefakte

- `frontend/cypress/results/tester-ui-validation-40a9fc58.json`
- `frontend/cypress/results/tester-ui-validation-d0637c27.json`
- `TESTER_UI_PRUEFPROTOKOLL.md`
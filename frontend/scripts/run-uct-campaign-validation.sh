#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
FIXTURE_PATH="$FRONTEND_DIR/cypress/fixtures/uct_campaign_seed.json"

SEED_CMD="${UCT_VALIDATION_SEED_CMD:-cd \"$ROOT_DIR\" && docker-compose cp backend/scripts/seed_uct_campaign_validation.py backend:/app/scripts/seed_uct_campaign_validation.py >/dev/null && docker-compose exec -T backend python /app/scripts/seed_uct_campaign_validation.py}"

RAW_OUTPUT="$(eval "$SEED_CMD")"

python3 - <<'PY' "$FIXTURE_PATH" "$RAW_OUTPUT" "${UCT_SCENARIO_LIMIT:-}" "${UCT_PLAYER_LIMIT_PER_SCENARIO:-}"
import json
import sys

fixture_path = sys.argv[1]
raw_output = sys.argv[2]
scenario_limit_raw = sys.argv[3]
player_limit_raw = sys.argv[4]

json_line = None
for line in reversed([line.strip() for line in raw_output.splitlines() if line.strip()]):
    if line.startswith('{'):
        json_line = line
        break

if json_line is None:
    raise SystemExit(f'No JSON payload found in seed output:\n{raw_output}')

payload = json.loads(json_line)

scenario_limit = int(scenario_limit_raw) if scenario_limit_raw else None
player_limit = int(player_limit_raw) if player_limit_raw else None

scenarios = list(payload.get('scenarios') or [])
if scenario_limit is not None:
    scenarios = scenarios[:scenario_limit]

trimmed_scenarios = []
for scenario in scenarios:
    players = list((scenario or {}).get('players') or [])
    if player_limit is not None:
        players = players[:player_limit]
    trimmed_scenarios.append({
        **scenario,
        'players': players,
    })

payload['scenarios'] = trimmed_scenarios
payload['total_scenarios'] = len(trimmed_scenarios)
payload['total_players'] = sum(len((scenario or {}).get('players') or []) for scenario in trimmed_scenarios)

with open(fixture_path, 'w', encoding='utf-8') as fh:
    json.dump(payload, fh)
PY

if [[ "${UCT_SKIP_CYPRESS:-0}" == "1" ]]; then
  echo "Wrote fixture to $FIXTURE_PATH"
  exit 0
fi

cd "$FRONTEND_DIR"
npx cypress run --spec cypress/e2e/uct-campaign-all-rounds.cy.js "$@"
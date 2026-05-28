#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${T49_API_TOKEN:-}" ]]; then
  echo "T49_API_TOKEN is required" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_FIXTURES="$CLI_DIR/test/fixtures/api/live"
TABLE_FIXTURES="$CLI_DIR/test/fixtures/table/live"

mkdir -p "$API_FIXTURES" "$TABLE_FIXTURES"

run_json() {
  local out="$1"
  shift
  pnpm --dir "$CLI_DIR" --silent dev "$@" --json > "$API_FIXTURES/$out"
}

run_table() {
  local out="$1"
  shift
  pnpm --dir "$CLI_DIR" --silent dev "$@" --table > "$TABLE_FIXTURES/$out"
}

read_id() {
  local file="$1"
  local expr="$2"
  node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const get=(obj,path)=>path.split('.').reduce((v,p)=>v&&v[p],obj); const id=get(j, process.argv[2]) || ''; process.stdout.write(String(id));" "$file" "$expr"
}

run_json "shipments.list.json" shipments list --page-size 2
run_json "containers.list.json" containers list --page-size 2
run_json "tracking-requests.list.json" tracking-requests list --page-size 2
run_json "shipping-lines.list.json" shipping-lines list --search HLCU
run_json "search.container-number.json" search HLCUIT1251213429

shipment_id="$(read_id "$API_FIXTURES/shipments.list.json" "data.items.0.id")"
container_id="$(read_id "$API_FIXTURES/containers.list.json" "data.items.0.id")"
tracking_id="$(read_id "$API_FIXTURES/tracking-requests.list.json" "data.items.0.id")"
shipment_bol="$(read_id "$API_FIXTURES/shipments.list.json" "data.items.0.billOfLading")"
container_number="$(read_id "$API_FIXTURES/containers.list.json" "data.items.0.number")"
tracking_number="$(read_id "$API_FIXTURES/tracking-requests.list.json" "data.items.0.requestNumber")"
terminal_id="$(read_id "$API_FIXTURES/containers.list.json" "data.items.0.terminals.podTerminal.id")"
vessel_imo="$(read_id "$API_FIXTURES/shipments.list.json" "data.items.0.vesselAtPod.imo")"
port_code="$(read_id "$API_FIXTURES/shipments.list.json" "data.items.0.ports.portOfLading.code")"

run_json "shipments.get.json" shipments get "$shipment_id"
run_json "containers.get.json" containers get "$container_id"
run_json "tracking-requests.get.json" tracking-requests get "$tracking_id"
run_json "containers.events.json" containers events "$container_id"
run_json "containers.raw-events.json" containers raw-events "$container_id"
run_json "containers.demurrage.json" containers demurrage "$container_id"
run_json "containers.rail.json" containers rail "$container_id"
run_json "search.shipment-bol.json" search "$shipment_bol"
run_json "search.container-list-number.json" search "$container_number"
run_json "search.tracking-number.json" search "$tracking_number"

run_json "webhooks.list.json" webhooks list --page-size 2
run_json "webhooks.ips.json" webhooks ips
run_json "webhook-notifications.list.json" webhook-notifications list --page-size 2
run_json "parties.list.json" parties list --page-size 2
run_json "custom-field-definitions.list.json" custom-field-definitions list --page-size 2

if [[ -n "$terminal_id" ]]; then
  run_json "terminals.get.json" terminals get "$terminal_id"
fi
if [[ -n "$vessel_imo" ]]; then
  run_json "vessels.get-by-imo.json" vessels get-by-imo "$vessel_imo"
fi
if [[ -n "$port_code" ]]; then
  run_json "ports.get.json" ports get "$port_code"
fi

set +e
pnpm --dir "$CLI_DIR" --silent dev containers route "$container_id" --json > /tmp/t49.route.out 2> "$API_FIXTURES/containers.route.error.json"
pnpm --dir "$CLI_DIR" --silent dev containers map "$container_id" --json > /tmp/t49.map.out 2> "$API_FIXTURES/containers.map.error.json"
pnpm --dir "$CLI_DIR" --silent dev custom-fields list --page-size 2 --json > /tmp/t49.custom-fields.out 2> "$API_FIXTURES/custom-fields.list.error.json"
pnpm --dir "$CLI_DIR" --silent dev webhook-notifications examples --json > /tmp/t49.webhook-examples.out 2> "$API_FIXTURES/webhook-notifications.examples.error.json"
set -e

run_table "shipments.list.txt" shipments list --page-size 2
run_table "containers.list.txt" containers list --page-size 2
run_table "tracking-requests.list.txt" tracking-requests list --page-size 2
run_table "shipping-lines.list.txt" shipping-lines list --search HLCU
run_table "search.container-number.txt" search HLCUIT1251213429
run_table "custom-field-definitions.list.txt" custom-field-definitions list --page-size 2
run_table "parties.list.txt" parties list --page-size 2
if [[ -n "$terminal_id" ]]; then
  run_table "terminals.get.txt" terminals get "$terminal_id"
fi

echo "Live fixtures captured in $API_FIXTURES and $TABLE_FIXTURES"

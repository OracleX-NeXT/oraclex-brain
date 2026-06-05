#!/usr/bin/env bash
# OracleX Brain — client installer. Connects this machine's Claude to a shared brain.
# Usage: ./install-client.sh <BRAIN_URL> <TOKEN>
#   e.g. ./install-client.sh https://brain-mcp.example.com/mcp YOUR_TOKEN_HERE
set -euo pipefail

URL="${1:-}"; TOKEN="${2:-}"
if [ -z "$URL" ] || [ -z "$TOKEN" ]; then
  echo "usage: $0 <BRAIN_URL> <TOKEN>"
  echo "  BRAIN_URL  e.g. https://brain-mcp.your-domain.com/mcp"
  echo "  TOKEN      the bearer token from your mother server (~/.config/oraclex-brain/token)"
  exit 1
fi

CFG="$HOME/.claude.json"
[ -f "$CFG" ] || echo '{}' > "$CFG"

echo "→ verifying brain is reachable…"
if curl -fsS -m 15 -X POST "$URL" \
     -H "content-type: application/json" -H "authorization: Bearer $TOKEN" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' >/dev/null; then
  echo "  ✓ brain reachable + token accepted"
else
  echo "  ✗ could not reach brain or token rejected — check URL/token"; exit 1
fi

echo "→ adding 'oraclex-brain' MCP to $CFG …"
python3 - "$CFG" "$URL" "$TOKEN" <<'PY'
import json, sys, shutil, os
cfg, url, token = sys.argv[1], sys.argv[2], sys.argv[3]
shutil.copy(cfg, cfg + ".bak-oraclex-brain")
d = json.load(open(cfg))
d.setdefault("mcpServers", {})
d["mcpServers"]["oraclex-brain"] = {
    "type": "http", "url": url,
    "headers": {"Authorization": "Bearer " + token},
}
json.dump(d, open(cfg, "w"), indent=2)
print("  ✓ added (backup: " + os.path.basename(cfg) + ".bak-oraclex-brain)")
PY

echo
echo "✅ done. Restart Claude — you now have: brain_search · brain_learn · brain_recent · brain_stats"
echo "   (the brain lives on the mother; this machine just connects to it)"

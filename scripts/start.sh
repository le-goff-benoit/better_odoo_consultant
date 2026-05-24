#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$ROOT_DIR/.venv/bin/activate"
COMMAND="better-odoo-assistant"
if ! command -v "$COMMAND" >/dev/null 2>&1; then
  COMMAND="odoo-portal"
fi

# Kill any previous instance still listening on the same port — otherwise the
# new process silently fails to bind and you keep talking to the stale code.
if pgrep -f "better-odoo-assistant serve\|odoo-portal serve" >/dev/null 2>&1; then
  echo "▶ Process Better Odoo Assistant déjà actif — kill puis relance"
  pkill -f "better-odoo-assistant serve" || true
  pkill -f "odoo-portal serve" || true
  sleep 1
fi

# Open browser after 2s
(sleep 2 && (xdg-open http://localhost:8765 2>/dev/null || open http://localhost:8765 2>/dev/null || true)) &

"$COMMAND" serve

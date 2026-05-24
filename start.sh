#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/.venv/bin/activate"

# Kill any previous instance still listening on the same port — otherwise the
# new process silently fails to bind and you keep talking to the stale code.
if pgrep -f "odoo-portal serve" >/dev/null 2>&1; then
  echo "▶ Process odoo-portal déjà actif — kill puis relance"
  pkill -f "odoo-portal serve" || true
  sleep 1
fi

# Open browser after 2s
(sleep 2 && (xdg-open http://localhost:8765 2>/dev/null || open http://localhost:8765 2>/dev/null || true)) &

odoo-portal serve

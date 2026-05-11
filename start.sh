#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/.venv/bin/activate"

# Open browser after 2s
(sleep 2 && (xdg-open http://localhost:8765 2>/dev/null || open http://localhost:8765 2>/dev/null || true)) &

odoo-portal serve

#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Odoo Consultant Portal — installateur automatique
# Usage : bash install.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { echo -e "${BOLD}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
error()   { echo -e "${RED}✗ $*${RESET}"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗"
echo -e "║   Odoo Consultant Portal — Installation  ║"
echo -e "╚══════════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Python ────────────────────────────────────────────────
info "Vérification de Python..."

install_python() {
  warn "Python 3 non trouvé — tentative d'installation automatique..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y python3 python3-venv python3-pip
  elif command -v brew &>/dev/null; then
    brew install python@3.12
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y python3 python3-pip
  elif command -v pacman &>/dev/null; then
    sudo pacman -Sy --noconfirm python
  else
    echo ""
    echo -e "${RED}Impossible d'installer Python automatiquement.${RESET}"
    echo -e "Veuillez l'installer manuellement depuis : ${BOLD}https://www.python.org/downloads/${RESET}"
    echo -e "Puis relancez : ${BOLD}bash install.sh${RESET}"
    exit 1
  fi
}

if ! command -v python3 &>/dev/null; then
  install_python
fi

# Re-check after potential install
if ! command -v python3 &>/dev/null; then
  echo -e "${RED}Python introuvable après installation. Installez-le depuis https://python.org${RESET}"
  exit 1
fi

PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)

if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 9 ]; }; then
  warn "Python $PY_VERSION est très ancien — certaines fonctionnalités pourraient ne pas fonctionner."
  warn "Pour de meilleures performances, installez Python 3.11+ depuis https://python.org"
elif { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 11 ]; }; then
  warn "Python $PY_VERSION détecté (3.11+ recommandé) — l'installation continue."
fi
success "Python $PY_VERSION"

# ── 2. Virtualenv ────────────────────────────────────────────
VENV_DIR="$(dirname "$0")/.venv"

if [ ! -d "$VENV_DIR" ]; then
  info "Création de l'environnement virtuel..."
  python3 -m venv "$VENV_DIR"
  success "Environnement créé dans .venv/"
else
  success "Environnement virtuel existant (.venv/)"
fi

# Activate
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# ── 3. Install package ───────────────────────────────────────
info "Mise à jour des outils de base (pip, setuptools)..."
pip install --upgrade pip setuptools wheel --quiet
success "Outils à jour"

info "Installation du portail (peut prendre 1-2 minutes)..."
pip install -e "$(dirname "$0")" --quiet
success "Portail installé"

# ── 3b. AI packages ──────────────────────────────────────────
info "Installation des assistants IA (Claude, GPT-4o, Gemini)..."
pip install anthropic openai "google-generativeai>=0.8" --quiet \
  && success "Assistants IA prêts — Claude, GPT-4o et Gemini disponibles" \
  || warn "Certains packages IA n'ont pas pu s'installer (non bloquant)."

# ── 4. Node / frontend (optional) ───────────────────────────
FRONTEND_DIR="$(dirname "$0")/frontend"
DIST_DIR="$FRONTEND_DIR/dist"

if [ ! -d "$DIST_DIR" ]; then
  if command -v npm &>/dev/null; then
    info "Construction de l'interface web..."
    cd "$FRONTEND_DIR"
    npm install --silent
    npm run build --silent
    cd - > /dev/null
    success "Interface web construite"
  else
    warn "npm non trouvé — l'interface web ne sera pas disponible."
    warn "Installez Node.js 18+ depuis https://nodejs.org pour l'activer."
  fi
else
  success "Interface web déjà construite"
fi

# ── 5. Init database ─────────────────────────────────────────
info "Initialisation de la base de données..."
odoo-portal init
success "Base de données prête"

# ── 6. Done ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Installation terminée !${RESET}"
echo ""
echo -e "Pour démarrer le portail, lancez :"
echo -e "  ${BOLD}source .venv/bin/activate && odoo-portal serve${RESET}"
echo ""
echo -e "Ou utilisez le raccourci :"
echo -e "  ${BOLD}bash start.sh${RESET}"
echo ""

# Create start.sh shortcut
cat > "$(dirname "$0")/start.sh" << 'STARTSCRIPT'
#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/.venv/bin/activate"

# Open browser after 2s
(sleep 2 && (xdg-open http://localhost:8765 2>/dev/null || open http://localhost:8765 2>/dev/null || true)) &

odoo-portal serve
STARTSCRIPT
chmod +x "$(dirname "$0")/start.sh"

success "Raccourci créé : ./start.sh"

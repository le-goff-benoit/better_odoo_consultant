#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Better Odoo Assistant — installateur automatique
# Usage : bash scripts/install.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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
echo -e "║   Better Odoo Assistant — Installation   ║"
echo -e "╚══════════════════════════════════════════╝${RESET}"
echo ""

# ── 0. Mise à jour du code ───────────────────────────────────
if [ -z "${_AFTER_PULL:-}" ] && git -C "$ROOT_DIR" rev-parse --git-dir &>/dev/null; then
  info "Mise à jour du code depuis GitHub..."
  if git -C "$ROOT_DIR" pull --ff-only 2>/dev/null; then
    success "Code à jour — relance du script..."
    export _AFTER_PULL=1
    exec bash "$(realpath "$0")" "$@"
  else
    warn "Impossible de mettre à jour automatiquement (modifications locales ?)."
  fi
fi

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
    echo -e "Puis relancez : ${BOLD}bash scripts/install.sh${RESET}"
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

# ── 1b. Poppler (PDF→image fallback) ─────────────────────────
# Used by the `attachment_handler` skill when a PDF is uploaded with a
# provider that does not support PDFs natively (GitHub Models, Copilot).
# Non-blocking : si poppler manque, le skill bascule sur pypdf seul.
if ! command -v pdftoppm &>/dev/null; then
  info "poppler-utils non trouvé — tentative d'installation (pour le fallback PDF→image)..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y poppler-utils 2>/dev/null \
      && success "poppler-utils installé" \
      || warn "Échec apt — installe manuellement: sudo apt install poppler-utils"
  elif command -v brew &>/dev/null; then
    brew install poppler 2>/dev/null \
      && success "poppler installé via Homebrew" \
      || warn "Échec brew — installe manuellement: brew install poppler"
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y poppler-utils 2>/dev/null && success "poppler-utils installé" || warn "Échec dnf"
  else
    warn "poppler-utils non installé — les PDFs scannés ne pourront pas être convertis en images sur GitHub/Copilot. Installation manuelle requise."
  fi
else
  success "poppler-utils déjà installé"
fi

# ── 2. Virtualenv ────────────────────────────────────────────
VENV_DIR="$ROOT_DIR/.venv"

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
pip install -e "$ROOT_DIR" --quiet
success "Portail installé"

# ── 3b. AI packages ──────────────────────────────────────────
info "Installation des assistants IA (Claude, GPT-4o, Gemini)..."
pip install anthropic openai "google-generativeai>=0.8" --quiet \
  && success "Assistants IA prêts — Claude, GPT-4o et Gemini disponibles" \
  || warn "Certains packages IA n'ont pas pu s'installer (non bloquant)."

# ── 4. Node / frontend ──────────────────────────────────────
FRONTEND_DIR="$ROOT_DIR/frontend"
DIST_DIR="$FRONTEND_DIR/dist"

install_node() {
  info "Node.js non trouvé — tentative d'installation automatique..."
  if command -v apt-get &>/dev/null; then
    if command -v curl &>/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    else
      sudo apt-get install -y curl
      curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    fi
    sudo apt-get install -y nodejs
  elif command -v brew &>/dev/null; then
    brew install node
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y nodejs npm
  elif command -v pacman &>/dev/null; then
    sudo pacman -Sy --noconfirm nodejs npm
  else
    error "Impossible d'installer Node.js automatiquement. Installez-le depuis https://nodejs.org puis relancez scripts/install.sh"
  fi
  hash -r 2>/dev/null || true
}

if ! command -v npm &>/dev/null; then
  install_node
fi
if command -v npm &>/dev/null; then
  info "Construction de l'interface web..."
  cd "$FRONTEND_DIR"
  npm install --silent
  npm run build --silent
  cd - > /dev/null
  success "Interface web construite"
else
  error "npm toujours introuvable après installation. Installez Node.js 18+ depuis https://nodejs.org puis relancez scripts/install.sh"
fi

# ── 5. Init database ─────────────────────────────────────────
info "Initialisation de la base de données..."
better-odoo-assistant init
success "Base de données prête"

# ── 6. Done ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Installation terminée !${RESET}"
echo ""
echo -e "Pour démarrer le portail, lancez :"
echo -e "  ${BOLD}source .venv/bin/activate && better-odoo-assistant serve${RESET}"
echo ""
echo -e "Ou utilisez le raccourci :"
echo -e "  ${BOLD}bash scripts/start.sh${RESET}"
echo ""

# Create scripts/start.sh shortcut
cat > "$SCRIPT_DIR/start.sh" << 'STARTSCRIPT'
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
STARTSCRIPT
chmod +x "$SCRIPT_DIR/start.sh"

success "Raccourci créé : ./scripts/start.sh"

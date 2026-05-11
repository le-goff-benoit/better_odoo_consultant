# Odoo Consultant Portal

Votre portail local pour travailler avec Odoo au quotidien — sans configuration technique complexe.

---

## Installation rapide

### Étape 1 — Téléchargez le portail

```bash
git clone https://github.com/le-goff-benoit/better_odoo_consultant.git
cd better_odoo_consultant
```

### Étape 2 — Lancez l'installation (une seule fois)

```bash
bash install.sh
```

Le script installe tout automatiquement : Python, les dépendances, et l'interface web.

### Étape 3 — Démarrez le portail

```bash
bash start.sh
```

Le portail s'ouvre automatiquement dans votre navigateur à l'adresse **http://localhost:8765**.

---

## Ce que vous pouvez faire

### 📥 Télécharger les sources Odoo
Allez dans **Sources** pour télécharger les versions 15 à 19 d'Odoo en un clic.  
Si vous avez accès à GitHub Enterprise (SSH), le portail le détecte automatiquement.  
Pas de clé SSH ? Le portail vous guide pas à pas pour en créer une et l'ajouter à GitHub.

### 🏢 Gérer vos projets Odoo.sh
Allez dans **Mes projets** pour ajouter une instance Odoo cliente.  
Un assistant en 3 étapes vous guide :
1. Donnez un nom au projet et collez l'URL Odoo
2. Entrez vos identifiants — le portail **détecte automatiquement** la version et les modules installés
3. Ajoutez optionnellement le dépôt GitHub du projet

Depuis chaque projet, accédez directement à **Odoo**, **Odoo.sh** et **GitHub** en un clic.

### 🔍 Requêter une base Odoo
Allez dans **Requêtes** pour chercher et lire des données depuis n'importe quelle instance Odoo.  
Exportez les résultats en Markdown, CSV ou Excel.

### 📁 Gérer vos dépôts locaux
Allez dans **Dépôts** pour cloner, mettre à jour et consulter vos modules personnalisés.

---

## Prérequis

| Outil | Version minimum | Pour quoi |
|---|---|---|
| Python | 3.11+ | Obligatoire |
| Node.js | 18+ | Interface web (optionnel, mais recommandé) |
| Git | Toute version récente | Pour les sources et dépôts |

**Python** : https://www.python.org/downloads/  
**Node.js** : https://nodejs.org/

---

## Démarrage développeur

```bash
# Backend (API)
source .venv/bin/activate
odoo-portal serve --reload

# Frontend (interface web en développement)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Variables d'environnement (optionnel)

| Variable | Défaut | Description |
|---|---|---|
| `ODOO_PORTAL_DATA_DIR` | `~/.odoo-portal` | Dossier de données |
| `ODOO_PORTAL_API_PORT` | `8765` | Port de l'API |

Créez un fichier `.env` à la racine du projet pour les personnaliser.

---

## Lancer les tests

```bash
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

---

## Serveur MCP (pour Claude)

```bash
odoo-portal mcp
```

Expose des outils de lecture Odoo pour les clients MCP (Claude Desktop, etc.).

---

## Licence

MIT

# Odoo Consultant Portal

A local web portal for Odoo consultants. Manage Odoo source repositories, connection profiles, project repositories, and run read-only queries — all from a browser on your laptop.

## Features

- **Source management** — clone/pull Odoo Community & Enterprise for versions 15.0–19.0
- **Profiles** — store Odoo.sh connection details; API keys secured in system keyring
- **Project repositories** — clone, pull, browse branches and commits
- **Read-only Odoo queries** — search/read models, inspect fields, export as Markdown/CSV/Excel
- **Prompt history** — track every query with status, duration and export path
- **MCP server** — skeleton for AI tool integration (read-only Odoo tools)
- **CLI** — `odoo-portal init | serve | source sync`

## Installation

### Requirements

- Python 3.11+
- Node.js 18+ (for building the frontend)

### Install from source

```bash
git clone https://github.com/your-org/better_odoo_consultant.git
cd better_odoo_consultant
pip install -e ".[dev]"
```

### Build the frontend (optional — needed for the bundled UI)

```bash
cd frontend
npm install
npm run build
cd ..
```

Without building the frontend, the API is still fully functional and can be accessed at `http://localhost:8765/api/`.

## Usage

### Initialize

```bash
odoo-portal init
```

Creates `~/.odoo-portal/` and initialises the SQLite database.

### Start the portal

```bash
odoo-portal serve
```

Opens the web UI at **http://localhost:8765** (or http://localhost:5173 when running the Vite dev server).

For frontend development:

```bash
# Terminal 1 — API
odoo-portal serve --reload

# Terminal 2 — Vite dev server
cd frontend && npm run dev
```

### Sync Odoo sources

```bash
# Community only
odoo-portal source sync --version 17.0 --path ~/odoo-sources/17.0

# Community + Enterprise (requires SSH access to github.com)
odoo-portal source sync --version 17.0 --path ~/odoo-sources/17.0 --enterprise
```

### List profiles (CLI)

```bash
odoo-portal profile list
```

### Start the MCP server

```bash
odoo-portal mcp
```

Exposes read-only Odoo tools via the MCP stdio transport for use with Claude Desktop or other MCP clients.

## Configuration

Environment variables (prefix `ODOO_PORTAL_`):

| Variable | Default | Description |
|---|---|---|
| `ODOO_PORTAL_DATA_DIR` | `~/.odoo-portal` | Data and database directory |
| `ODOO_PORTAL_API_HOST` | `127.0.0.1` | API bind host |
| `ODOO_PORTAL_API_PORT` | `8765` | API bind port |

Or create a `.env` file in the working directory.

## Architecture

```
odoo_consultant_portal/
├── cli/          — Click CLI (init, serve, source sync, profile list, mcp)
├── api/          — FastAPI application
│   └── routes/   — REST endpoints (sources, profiles, projects, queries, history)
├── core/         — SQLModel models, database session, settings
├── services/     — Business logic (source manager, Odoo RPC client, keyring, …)
└── mcp/          — MCP server skeleton (tools, resources, prompts)
frontend/         — React + Vite single-page application
tests/            — pytest test suite
```

### Write operations

Write operations are intentionally excluded from the MVP. The architecture is prepared for them:
- All mutating Odoo calls will go through a dedicated `OdooWriter` class in `services/odoo_writer.py`
- Every write will return a preview diff before execution
- A confirmation step (`confirmed=True` parameter) will be required
- History entries will track write operations separately with `mode="write"`

## Running tests

```bash
pytest
```

With coverage:

```bash
pytest --cov=odoo_consultant_portal --cov-report=term-missing
```

## License

MIT

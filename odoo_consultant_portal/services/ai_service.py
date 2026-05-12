import asyncio
import json
import logging
import os
from typing import AsyncIterator, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..services.odoo_client import OdooClient

log = logging.getLogger(__name__)

# ── Tool definitions ─────────────────────────────────────────────

_TOOL_QUERY = {
    "name": "query_odoo",
    "description": "Rechercher des enregistrements dans Odoo (search_read). "
                   "Utilise cet outil pour répondre à toute question sur les données.",
}
_TOOL_COUNT = {
    "name": "count_odoo",
    "description": "Compter les enregistrements Odoo correspondant à un domaine.",
}
_TOOL_FIELDS = {
    "name": "get_odoo_fields",
    "description": "Lister les champs disponibles d'un modèle Odoo (pour découvrir quoi requêter).",
}
_TOOL_SEARCH_SRC = {
    "name": "search_odoo_source",
    "description": (
        "Rechercher dans le code source Odoo local (grep). "
        "Utilise pour trouver des modèles, méthodes, champs, modules, noms corrects de modèles. "
        "Retourne les lignes correspondantes avec fichier et numéro de ligne."
    ),
}
_TOOL_READ_SRC = {
    "name": "read_odoo_file",
    "description": (
        "Lire le contenu d'un fichier du code source Odoo local. "
        "Utilise après search_odoo_source pour voir l'implémentation complète."
    ),
}

# ── Claude tool schemas ───────────────────────────────────────────

TOOLS_CLAUDE = [
    {**_TOOL_QUERY, "input_schema": {"type": "object", "required": ["model", "fields"], "properties": {
        "model":  {"type": "string", "description": "Modèle Odoo (ex: account.move, sale.order, res.partner)"},
        "domain": {"type": "array",  "description": "Domaine Odoo, ex: [[\"state\",\"=\",\"posted\"]]", "default": []},
        "fields": {"type": "array",  "items": {"type": "string"}, "description": "Champs à récupérer"},
        "limit":  {"type": "integer", "description": "Nombre max de résultats (défaut 20)", "default": 20},
        "order":  {"type": "string",  "description": "Tri, ex: 'date desc'", "default": ""},
    }}},
    {**_TOOL_COUNT, "input_schema": {"type": "object", "required": ["model"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array", "default": []},
    }}},
    {**_TOOL_FIELDS, "input_schema": {"type": "object", "required": ["model"], "properties": {
        "model": {"type": "string"},
    }}},
    {**_TOOL_SEARCH_SRC, "input_schema": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string", "description": "Texte ou regex à chercher (ex: 'sale_line_id', 'class AccountMove', '_name = ')"},
        "path":       {"type": "string", "description": "Sous-dossier optionnel (ex: 'addons/stock', 'addons/sale')", "default": ""},
        "file_types": {"type": "array",  "items": {"type": "string"}, "description": "Extensions, ex: ['*.py'] ou ['*.xml']", "default": ["*.py"]},
    }}},
    {**_TOOL_READ_SRC, "input_schema": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string",  "description": "Chemin relatif depuis la racine des sources (ex: 'addons/stock/models/stock_route.py')"},
        "start_line": {"type": "integer", "description": "Première ligne à lire (défaut: 1)", "default": 1},
        "end_line":   {"type": "integer", "description": "Dernière ligne à lire (défaut: start_line + 150)", "default": 0},
    }}},
]

# ── OpenAI tool schemas ───────────────────────────────────────────

TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_QUERY, "parameters": {"type": "object", "required": ["model", "fields"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array",   "items": {}, "default": []},
        "fields": {"type": "array",   "items": {"type": "string"}},
        "limit":  {"type": "integer", "default": 20},
        "order":  {"type": "string",  "default": ""},
    }}}},
    {"type": "function", "function": {**_TOOL_COUNT, "parameters": {"type": "object", "required": ["model"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array", "items": {}, "default": []},
    }}}},
    {"type": "function", "function": {**_TOOL_FIELDS, "parameters": {"type": "object", "required": ["model"], "properties": {
        "model": {"type": "string"},
    }}}},
    {"type": "function", "function": {**_TOOL_SEARCH_SRC, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string"},
        "path":       {"type": "string",  "default": ""},
        "file_types": {"type": "array",   "items": {"type": "string"}, "default": ["*.py"]},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_SRC, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string"},
        "start_line": {"type": "integer", "default": 1},
        "end_line":   {"type": "integer", "default": 0},
    }}}},
]

# ── Gemini tool schemas ───────────────────────────────────────────

TOOLS_GEMINI = [
    {
        "function_declarations": [
            {"name": "query_odoo",    "description": _TOOL_QUERY["description"],
             "parameters": {"type": "object", "required": ["model", "fields"], "properties": {
                 "model":  {"type": "string"},  "domain": {"type": "array"},
                 "fields": {"type": "array"},   "limit":  {"type": "integer"},
                 "order":  {"type": "string"},
             }}},
            {"name": "count_odoo",   "description": _TOOL_COUNT["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model":  {"type": "string"}, "domain": {"type": "array"},
             }}},
            {"name": "get_odoo_fields", "description": _TOOL_FIELDS["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model": {"type": "string"},
             }}},
            {"name": "search_odoo_source", "description": _TOOL_SEARCH_SRC["description"],
             "parameters": {"type": "object", "required": ["pattern"], "properties": {
                 "pattern":    {"type": "string"},
                 "path":       {"type": "string"},
                 "file_types": {"type": "array"},
             }}},
            {"name": "read_odoo_file", "description": _TOOL_READ_SRC["description"],
             "parameters": {"type": "object", "required": ["path"], "properties": {
                 "path":       {"type": "string"},
                 "start_line": {"type": "integer"},
                 "end_line":   {"type": "integer"},
             }}},
        ]
    }
]

# ── Source-only tool schemas (general mode, no Odoo data) ────────

TOOLS_CLAUDE_SRC = [
    {**_TOOL_SEARCH_SRC, "input_schema": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string", "description": "Texte ou regex à chercher (ex: 'sale_line_id', 'class AccountMove', '_name = ')"},
        "path":       {"type": "string", "description": "Sous-dossier optionnel (ex: 'addons/stock', 'addons/sale')", "default": ""},
        "file_types": {"type": "array",  "items": {"type": "string"}, "description": "Extensions, ex: ['*.py'] ou ['*.xml']", "default": ["*.py"]},
    }}},
    {**_TOOL_READ_SRC, "input_schema": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string",  "description": "Chemin relatif depuis la racine des sources (ex: 'addons/stock/models/stock_route.py')"},
        "start_line": {"type": "integer", "description": "Première ligne à lire (défaut: 1)", "default": 1},
        "end_line":   {"type": "integer", "description": "Dernière ligne à lire (défaut: start_line + 150)", "default": 0},
    }}},
]

TOOLS_OPENAI_SRC = [
    {"type": "function", "function": {**_TOOL_SEARCH_SRC, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string"},
        "path":       {"type": "string",  "default": ""},
        "file_types": {"type": "array",   "items": {"type": "string"}, "default": ["*.py"]},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_SRC, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string"},
        "start_line": {"type": "integer", "default": 1},
        "end_line":   {"type": "integer", "default": 0},
    }}}},
]

TOOLS_GEMINI_SRC = [
    {
        "function_declarations": [
            {"name": "search_odoo_source", "description": _TOOL_SEARCH_SRC["description"],
             "parameters": {"type": "object", "required": ["pattern"], "properties": {
                 "pattern":    {"type": "string"},
                 "path":       {"type": "string"},
                 "file_types": {"type": "array"},
             }}},
            {"name": "read_odoo_file", "description": _TOOL_READ_SRC["description"],
             "parameters": {"type": "object", "required": ["path"], "properties": {
                 "path":       {"type": "string"},
                 "start_line": {"type": "integer"},
                 "end_line":   {"type": "integer"},
             }}},
        ]
    }
]

DEFAULT_MODELS = {
    "claude":   "claude-sonnet-4-6",
    "openai":   "gpt-4o",
    "gemini":   "gemini-2.0-flash",
    "github":   "gpt-4o",
    "copilot":  "gpt-4o",
}

GITHUB_MODELS_BASE_URL  = "https://models.inference.ai.azure.com"
COPILOT_BASE_URL        = "https://api.githubcopilot.com"
COPILOT_HEADERS         = {
    "editor-version":        "vscode/1.95.0",
    "editor-plugin-version": "copilot-chat/0.22.4",
    "copilot-integration-id": "vscode-chat",
}


# ── System prompt ────────────────────────────────────────────────

def build_system(profile, source_path: Optional[str] = None, context_md: str = "") -> str:
    source_section = ""
    if source_path:
        source_section = f"""
Code source Odoo disponible localement : {source_path}
IMPORTANT : Pour toute question sur des modèles, champs, méthodes ou comportements Odoo, utilise SYSTÉMATIQUEMENT search_odoo_source avant de répondre. Ne suppose jamais un nom de modèle ou de champ — vérifie dans le code source.
Exemples d'utilisation :
- Trouver un modèle : search_odoo_source(pattern="_name = 'sale.order'")
- Trouver une méthode : search_odoo_source(pattern="def action_confirm", path="addons/sale")
- Lire un fichier : read_odoo_file(path="addons/account/models/account_move.py", start_line=1, end_line=100)
"""
    else:
        source_section = "\nCode source non disponible (sources non installées pour cette version).\n"

    return f"""Tu es un assistant expert Odoo qui aide les consultants à analyser les données et le code source de leurs clients.

Instance connectée :
- URL : {profile.db_url}
- Version : {profile.odoo_version or "inconnue"}
- Base : {profile.db_name}
- Société : {profile.company_name or "inconnue"}
{source_section}
Instructions :
- Utilise les outils pour interroger Odoo directement et répondre avec des données réelles
- Quand un modèle n'existe pas sur l'instance, cherche son nom correct dans le code source avant d'abandonner
- Présente les listes sous forme de tableaux Markdown
- Si tu ne connais pas les champs d'un modèle, utilise get_odoo_fields d'abord
- Réponds dans la langue de l'utilisateur (français si l'utilisateur écrit en français)
- Sois concis et orienté résultats

Modèles Odoo fréquents (noms peuvent varier selon la version) :
- Factures clients     : account.move, domain [["move_type","in",["out_invoice","out_refund"]]]
- Factures fournisseurs: account.move, domain [["move_type","in",["in_invoice","in_refund"]]]
- Commandes ventes     : sale.order
- Lignes de commande   : sale.order.line
- Commandes achats     : purchase.order
- Clients              : res.partner, domain [["customer_rank",">",0]]
- Fournisseurs         : res.partner, domain [["supplier_rank",">",0]]
- Produits             : product.template
- Variantes produit    : product.product
- Employés             : hr.employee
- Congés               : hr.leave
- CRM/Opportunités     : crm.lead
- Tâches projet        : project.task
- Routes stock         : stock.route (anciennement stock.location.route avant v16)
- Règles de réapprovisionnement : stock.warehouse.orderpoint
- Mouvements de stock  : stock.move
{chr(10) + "---" + chr(10) + chr(10) + context_md.strip() if context_md.strip() else ""}
"""


def build_system_general(version: str, source_path: Optional[str] = None, context_md: str = "") -> str:
    source_section = (
        f"Code source Odoo disponible localement : {source_path}\n"
        "IMPORTANT : Pour toute question sur des modèles, champs, méthodes ou comportements Odoo, utilise SYSTÉMATIQUEMENT search_odoo_source avant de répondre. Ne suppose jamais un nom de modèle ou de champ — vérifie dans le code source.\n"
        "Exemples d'utilisation :\n"
        "- Trouver un modèle : search_odoo_source(pattern=\"_name = 'sale.order'\")\n"
        "- Trouver une méthode : search_odoo_source(pattern=\"def action_confirm\", path=\"addons/sale\")\n"
        "- Lire un fichier : read_odoo_file(path=\"addons/account/models/account_move.py\", start_line=1, end_line=100)\n"
    ) if source_path else "Code source non disponible pour cette version.\n"

    return f"""Tu es un expert Odoo qui répond à des questions générales sur l'ERP, indépendamment de tout projet client.

Version Odoo : {version}
{source_section}
Instructions :
- Réponds à toutes questions sur l'architecture Odoo, les modèles de données, les modules, les migrations
- Utilise le code source pour illustrer ou vérifier tes réponses quand c'est pertinent
- Présente les listes sous forme de tableaux Markdown
- Réponds dans la langue de l'utilisateur (français si l'utilisateur écrit en français)
- Sois précis, pédagogique, orienté consultant
- Tu n'as pas accès aux données d'une instance Odoo (mode général sans connexion client)
{chr(10) + "---" + chr(10) + chr(10) + context_md.strip() if context_md.strip() else ""}
"""


# ── Source code tools ────────────────────────────────────────────

def _safe_source_path(source_path: str, sub_path: str) -> Optional[str]:
    """Return an absolute path only if it stays within source_path."""
    base = os.path.realpath(source_path)
    full = os.path.realpath(os.path.join(source_path, sub_path)) if sub_path else base
    return full if full.startswith(base) else None


async def _search_odoo_source(args: dict, source_path: str) -> dict:
    pattern    = args.get("pattern", "")
    sub_path   = args.get("path", "") or ""
    file_types = args.get("file_types") or ["*.py"]

    search_dir = _safe_source_path(source_path, sub_path)
    if not search_dir:
        return {"ok": False, "error": "Chemin invalide (traversal détecté)"}
    if not os.path.isdir(search_dir):
        return {"ok": False, "error": f"Dossier introuvable : {sub_path or source_path}"}

    includes = []
    for ft in file_types[:4]:  # max 4 types
        includes += ["--include", ft]

    try:
        proc = await asyncio.create_subprocess_exec(
            "grep", "-r", "-n", "-i", "-m", "200",
            *includes,
            pattern, search_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
    except asyncio.TimeoutError:
        return {"ok": False, "error": "Timeout — pattern trop large, affinez la recherche"}

    raw_lines = stdout.decode("utf-8", errors="replace").splitlines()
    base_real = os.path.realpath(source_path) + os.sep

    by_file: dict = {}
    for line in raw_lines[:200]:
        parts = line.split(":", 2)
        if len(parts) < 3:
            continue
        file_abs, linenum, content = parts[0], parts[1], parts[2]
        rel = file_abs.replace(base_real, "")
        if rel not in by_file:
            by_file[rel] = []
        by_file[rel].append({"line": int(linenum), "content": content.strip()})

    if not by_file:
        return {"ok": True, "matches": 0, "files": {}, "note": "Aucune correspondance — essayez un autre pattern ou chemin"}

    return {"ok": True, "matches": len(raw_lines), "files": by_file}


async def _read_odoo_file(args: dict, source_path: str) -> dict:
    rel_path   = args.get("path", "")
    start_line = max(1, int(args.get("start_line") or 1))
    end_line   = int(args.get("end_line") or 0)

    file_abs = _safe_source_path(source_path, rel_path)
    if not file_abs:
        return {"ok": False, "error": "Chemin invalide"}
    if not os.path.isfile(file_abs):
        return {"ok": False, "error": f"Fichier introuvable : {rel_path}"}

    try:
        with open(file_abs, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

    total = len(all_lines)
    s = start_line - 1
    e = end_line if end_line > 0 else s + 150
    e = min(e, s + 200, total)   # hard cap: 200 lines

    content = "".join(all_lines[s:e])
    return {
        "ok":         True,
        "path":       rel_path,
        "start_line": s + 1,
        "end_line":   e,
        "total_lines": total,
        "content":    content,
    }


# ── Tool executor ────────────────────────────────────────────────

async def _run_tool(name: str, args: dict, odoo: "OdooClient", source_path: Optional[str] = None) -> dict:
    loop = asyncio.get_event_loop()
    try:
        if name == "query_odoo":
            records = await loop.run_in_executor(None, lambda: odoo.search_read(
                args["model"],
                args.get("domain", []),
                args.get("fields", []),
                min(int(args.get("limit", 20)), 100),
                0,
                args.get("order", ""),
            ))
            return {"ok": True, "count": len(records), "records": records}

        elif name == "count_odoo":
            count = await loop.run_in_executor(None, lambda: odoo.search_count(
                args["model"], args.get("domain", [])
            ))
            return {"ok": True, "count": count}

        elif name == "get_odoo_fields":
            raw = await loop.run_in_executor(None, lambda: odoo.fields_get(
                args["model"], ["string", "type"]
            ))
            condensed = {k: {"label": v.get("string"), "type": v.get("type")}
                         for k, v in list(raw.items())[:80]}
            return {"ok": True, "fields": condensed}

        elif name == "search_odoo_source":
            if not source_path:
                return {"ok": False, "error": "Code source non disponible — installez les sources depuis la page Sources"}
            return await _search_odoo_source(args, source_path)

        elif name == "read_odoo_file":
            if not source_path:
                return {"ok": False, "error": "Code source non disponible"}
            return await _read_odoo_file(args, source_path)

        return {"ok": False, "error": f"Outil inconnu: {name}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ── Claude ───────────────────────────────────────────────────────

async def _chat_claude(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None) -> AsyncIterator[dict]:
    try:
        import anthropic
    except ImportError:
        yield {"type": "error", "msg": "Package 'anthropic' non installé. Lancez : pip install anthropic"}
        return

    if tools is None:
        tools = TOOLS_CLAUDE
    client = anthropic.AsyncAnthropic(api_key=api_key)
    loop_msgs = list(messages)

    for _ in range(10):
        response = await client.messages.create(
            model=model_id,
            max_tokens=4096,
            system=system,
            messages=loop_msgs,
            tools=tools,
        )

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    yield {"type": "tool_call", "name": block.name, "args": block.input}
                    result = await _run_tool(block.name, block.input, odoo, source_path)
                    yield {"type": "tool_result", "name": block.name, **result}
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result, ensure_ascii=False, default=str),
                    })
            loop_msgs.append({"role": "assistant", "content": response.content})
            loop_msgs.append({"role": "user", "content": tool_results})
        else:
            text = "".join(getattr(b, "text", "") for b in response.content)
            yield {"type": "text", "content": text}
            yield {"type": "done", "model": model_id}
            return

    yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}


# ── OpenAI (shared logic for OpenAI + GitHub Models + Copilot) ───

async def _chat_openai_client(client, model_id: str, system: str, messages: list, odoo, source_path, tools=None) -> AsyncIterator[dict]:
    if tools is None:
        tools = TOOLS_OPENAI
    oai_msgs = [{"role": "system", "content": system}] + messages
    for _ in range(10):
        response = await client.chat.completions.create(
            model=model_id, messages=oai_msgs, tools=tools,
        )
        choice = response.choices[0]
        if choice.finish_reason == "tool_calls":
            oai_msgs.append(choice.message)
            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments)
                yield {"type": "tool_call", "name": tc.function.name, "args": args}
                result = await _run_tool(tc.function.name, args, odoo, source_path)
                yield {"type": "tool_result", "name": tc.function.name, **result}
                oai_msgs.append({
                    "role": "tool", "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })
        else:
            yield {"type": "text", "content": choice.message.content or ""}
            yield {"type": "done", "model": model_id}
            return
    yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}


async def _chat_openai(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None) -> AsyncIterator[dict]:
    try:
        import openai
    except ImportError:
        yield {"type": "error", "msg": "Package 'openai' non installé. Lancez : pip install openai"}
        return
    client = openai.AsyncOpenAI(api_key=api_key)
    async for evt in _chat_openai_client(client, model_id, system, messages, odoo, source_path, tools):
        yield evt


async def _chat_github(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None) -> AsyncIterator[dict]:
    try:
        import openai
    except ImportError:
        yield {"type": "error", "msg": "Package 'openai' non installé."}
        return
    client = openai.AsyncOpenAI(api_key=api_key, base_url=GITHUB_MODELS_BASE_URL)
    async for evt in _chat_openai_client(client, model_id, system, messages, odoo, source_path, tools):
        yield evt


async def _chat_copilot(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None) -> AsyncIterator[dict]:
    try:
        import openai
    except ImportError:
        yield {"type": "error", "msg": "Package 'openai' non installé."}
        return
    client = openai.AsyncOpenAI(
        api_key=api_key,
        base_url=COPILOT_BASE_URL,
        default_headers=COPILOT_HEADERS,
    )
    async for evt in _chat_openai_client(client, model_id, system, messages, odoo, source_path, tools):
        yield evt


# ── Gemini ───────────────────────────────────────────────────────

async def _chat_gemini(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None) -> AsyncIterator[dict]:
    try:
        import google.generativeai as genai
    except ImportError:
        yield {"type": "error", "msg": "Package 'google-generativeai' non installé. Lancez : pip install google-generativeai"}
        return

    if tools is None:
        tools = TOOLS_GEMINI
    loop = asyncio.get_event_loop()
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=model_id,
        system_instruction=system,
        tools=tools,
    )

    history = []
    for m in messages[:-1]:
        role = "user" if m["role"] == "user" else "model"
        history.append({"role": role, "parts": [m["content"]]})
    last_msg = messages[-1]["content"] if messages else ""

    chat = model.start_chat(history=history)

    for _ in range(10):
        response = await loop.run_in_executor(None, lambda: chat.send_message(last_msg))
        part = response.candidates[0].content.parts[0]

        if hasattr(part, "function_call") and part.function_call.name:
            fc = part.function_call
            args = dict(fc.args)
            yield {"type": "tool_call", "name": fc.name, "args": args}
            result = await _run_tool(fc.name, args, odoo, source_path)
            yield {"type": "tool_result", "name": fc.name, **result}
            last_msg = genai.protos.Content(parts=[genai.protos.Part(
                function_response=genai.protos.FunctionResponse(
                    name=fc.name,
                    response={"result": json.dumps(result, ensure_ascii=False, default=str)},
                )
            )], role="user")
        else:
            text = response.text if hasattr(response, "text") else ""
            yield {"type": "text", "content": text}
            yield {"type": "done", "model": model_id}
            return

    yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}


# ── Public entry point ───────────────────────────────────────────

async def stream_chat(
    provider: str,
    api_key: str,
    model_id: Optional[str],
    odoo,          # None → general mode (source-only, no Odoo data)
    profile,       # None → general mode
    messages: list,
    source_path: Optional[str] = None,
    context_md: str = "",
    version: Optional[str] = None,  # used when profile is None
) -> AsyncIterator[dict]:
    model = model_id or DEFAULT_MODELS.get(provider, "")

    if profile is not None:
        system   = build_system(profile, source_path, context_md)
        tools_c  = TOOLS_CLAUDE
        tools_o  = TOOLS_OPENAI
        tools_g  = TOOLS_GEMINI
    else:
        system   = build_system_general(version or "?", source_path, context_md)
        tools_c  = TOOLS_CLAUDE_SRC
        tools_o  = TOOLS_OPENAI_SRC
        tools_g  = TOOLS_GEMINI_SRC

    if provider == "claude":
        async for evt in _chat_claude(api_key, model, system, messages, odoo, source_path, tools_c):
            yield evt
    elif provider == "openai":
        async for evt in _chat_openai(api_key, model, system, messages, odoo, source_path, tools_o):
            yield evt
    elif provider == "gemini":
        async for evt in _chat_gemini(api_key, model, system, messages, odoo, source_path, tools_g):
            yield evt
    elif provider == "github":
        async for evt in _chat_github(api_key, model, system, messages, odoo, source_path, tools_o):
            yield evt
    elif provider == "copilot":
        async for evt in _chat_copilot(api_key, model, system, messages, odoo, source_path, tools_o):
            yield evt
    else:
        yield {"type": "error", "msg": f"Fournisseur inconnu : {provider}"}

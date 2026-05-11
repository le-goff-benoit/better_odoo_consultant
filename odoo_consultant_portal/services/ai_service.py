import asyncio
import json
import logging
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

TOOLS_CLAUDE = [
    {**_TOOL_QUERY, "input_schema": {"type": "object", "required": ["model", "fields"], "properties": {
        "model":  {"type": "string", "description": "Modèle Odoo (ex: account.move, sale.order, res.partner)"},
        "domain": {"type": "array",  "description": "Domaine Odoo, ex: [[\"state\",\"=\",\"posted\"]]", "default": []},
        "fields": {"type": "array",  "items": {"type": "string"}, "description": "Champs à récupérer"},
        "limit":  {"type": "integer","description": "Nombre max de résultats (défaut 20)", "default": 20},
        "order":  {"type": "string", "description": "Tri, ex: 'date desc'", "default": ""},
    }}},
    {**_TOOL_COUNT, "input_schema": {"type": "object", "required": ["model"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array", "default": []},
    }}},
    {**_TOOL_FIELDS, "input_schema": {"type": "object", "required": ["model"], "properties": {
        "model": {"type": "string"},
    }}},
]

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
]

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
        ]
    }
]

DEFAULT_MODELS = {
    "claude": "claude-sonnet-4-6",
    "openai": "gpt-4o",
    "gemini": "gemini-1.5-pro",
}


# ── System prompt ────────────────────────────────────────────────

def build_system(profile) -> str:
    return f"""Tu es un assistant expert Odoo qui aide les consultants à analyser les données de leurs clients.

Instance connectée :
- URL : {profile.db_url}
- Version : {profile.odoo_version or "inconnue"}
- Base : {profile.db_name}
- Société : {profile.company_name or "inconnue"}

Instructions :
- Utilise les outils pour interroger Odoo directement et répondre avec des données réelles
- Présente les listes sous forme de tableaux Markdown
- Si tu ne connais pas les champs d'un modèle, utilise get_odoo_fields d'abord
- Réponds dans la langue de l'utilisateur (français si l'utilisateur écrit en français)
- Sois concis et orienté résultats

Modèles Odoo fréquents :
- Factures clients  : account.move, domain [["move_type","in",["out_invoice","out_refund"]]]
- Factures fournisseurs : account.move, domain [["move_type","in",["in_invoice","in_refund"]]]
- Commandes ventes  : sale.order
- Commandes achats  : purchase.order
- Clients           : res.partner, domain [["customer_rank",">",0]]
- Fournisseurs      : res.partner, domain [["supplier_rank",">",0]]
- Produits          : product.template
- Employés          : hr.employee
- Congés            : hr.leave
- CRM/Opportunités  : crm.lead
- Tâches projet     : project.task
"""


# ── Tool executor ────────────────────────────────────────────────

async def _run_tool(name: str, args: dict, odoo: "OdooClient") -> dict:
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

        return {"ok": False, "error": f"Outil inconnu: {name}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ── Claude ───────────────────────────────────────────────────────

async def _chat_claude(api_key: str, model_id: str, system: str, messages: list, odoo) -> AsyncIterator[dict]:
    try:
        import anthropic
    except ImportError:
        yield {"type": "error", "msg": "Package 'anthropic' non installé. Lancez : pip install anthropic"}
        return

    client = anthropic.AsyncAnthropic(api_key=api_key)
    loop_msgs = list(messages)

    for _ in range(8):
        response = await client.messages.create(
            model=model_id,
            max_tokens=4096,
            system=system,
            messages=loop_msgs,
            tools=TOOLS_CLAUDE,
        )

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    yield {"type": "tool_call", "name": block.name, "args": block.input}
                    result = await _run_tool(block.name, block.input, odoo)
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


# ── OpenAI ───────────────────────────────────────────────────────

async def _chat_openai(api_key: str, model_id: str, system: str, messages: list, odoo) -> AsyncIterator[dict]:
    try:
        import openai
    except ImportError:
        yield {"type": "error", "msg": "Package 'openai' non installé. Lancez : pip install openai"}
        return

    client = openai.AsyncOpenAI(api_key=api_key)
    oai_msgs = [{"role": "system", "content": system}] + messages

    for _ in range(8):
        response = await client.chat.completions.create(
            model=model_id,
            messages=oai_msgs,
            tools=TOOLS_OPENAI,
        )
        choice = response.choices[0]

        if choice.finish_reason == "tool_calls":
            oai_msgs.append(choice.message)
            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments)
                yield {"type": "tool_call", "name": tc.function.name, "args": args}
                result = await _run_tool(tc.function.name, args, odoo)
                yield {"type": "tool_result", "name": tc.function.name, **result}
                oai_msgs.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })
        else:
            yield {"type": "text", "content": choice.message.content or ""}
            yield {"type": "done", "model": model_id}
            return

    yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}


# ── Gemini ───────────────────────────────────────────────────────

async def _chat_gemini(api_key: str, model_id: str, system: str, messages: list, odoo) -> AsyncIterator[dict]:
    try:
        import google.generativeai as genai
    except ImportError:
        yield {"type": "error", "msg": "Package 'google-generativeai' non installé. Lancez : pip install google-generativeai"}
        return

    loop = asyncio.get_event_loop()
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=model_id,
        system_instruction=system,
        tools=TOOLS_GEMINI,
    )

    # Convert messages to Gemini format
    history = []
    for m in messages[:-1]:
        role = "user" if m["role"] == "user" else "model"
        history.append({"role": role, "parts": [m["content"]]})
    last_msg = messages[-1]["content"] if messages else ""

    chat = model.start_chat(history=history)

    for _ in range(8):
        response = await loop.run_in_executor(None, lambda: chat.send_message(last_msg))
        part = response.candidates[0].content.parts[0]

        if hasattr(part, "function_call") and part.function_call.name:
            fc = part.function_call
            args = dict(fc.args)
            yield {"type": "tool_call", "name": fc.name, "args": args}
            result = await _run_tool(fc.name, args, odoo)
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
    odoo,
    profile,
    messages: list,
) -> AsyncIterator[dict]:
    model = model_id or DEFAULT_MODELS.get(provider, "")
    system = build_system(profile)

    if provider == "claude":
        async for evt in _chat_claude(api_key, model, system, messages, odoo):
            yield evt
    elif provider == "openai":
        async for evt in _chat_openai(api_key, model, system, messages, odoo):
            yield evt
    elif provider == "gemini":
        async for evt in _chat_gemini(api_key, model, system, messages, odoo):
            yield evt
    else:
        yield {"type": "error", "msg": f"Fournisseur inconnu : {provider}"}

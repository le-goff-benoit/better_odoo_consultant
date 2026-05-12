import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...core.models import Profile
from ...services.keyring_service import store_secret, get_secret, delete_secret
from ...services.profile_manager import get_profile_api_key
from ...services.odoo_client import OdooClient
from ...services.ai_service import stream_chat, DEFAULT_MODELS

router = APIRouter()

_PROVIDERS = ("claude", "openai", "gemini", "github")
_KEY_PREFIX = "ai_key:"


def _ai_key(provider: str) -> Optional[str]:
    return get_secret(f"{_KEY_PREFIX}{provider}")


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ── Settings ─────────────────────────────────────────────────────

@router.get("/providers")
async def list_providers():
    return {p: bool(_ai_key(p)) for p in _PROVIDERS}


class KeyBody(BaseModel):
    provider: str
    key: str


@router.post("/key")
async def save_key(body: KeyBody):
    if body.provider not in _PROVIDERS:
        raise HTTPException(400, f"Fournisseur inconnu : {body.provider}")
    store_secret(f"{_KEY_PREFIX}{body.provider}", body.key.strip())
    return {"ok": True}


@router.delete("/key/{provider}")
async def delete_key(provider: str):
    if provider not in _PROVIDERS:
        raise HTTPException(400, f"Fournisseur inconnu : {provider}")
    delete_secret(f"{_KEY_PREFIX}{provider}")
    return {"ok": True}


# ── Chat ─────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    provider: str
    profile_id: int
    messages: list[ChatMessage]
    model: Optional[str] = None


@router.post("/chat")
async def chat(req: ChatRequest, session: AsyncSession = Depends(get_session)):
    if req.provider not in _PROVIDERS:
        raise HTTPException(400, f"Fournisseur inconnu : {req.provider}")

    api_key = _ai_key(req.provider)
    if not api_key:
        raise HTTPException(400, f"Clé API '{req.provider}' non configurée — ajoutez-la dans l'assistant.")

    profile = await session.get(Profile, req.profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")

    odoo_key = get_profile_api_key(profile.name)
    if not odoo_key:
        raise HTTPException(400, "Clé API Odoo introuvable pour ce projet")

    odoo = OdooClient(profile.db_url, profile.db_name, profile.login, odoo_key)
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    async def generate():
        try:
            async for evt in stream_chat(req.provider, api_key, req.model, odoo, profile, messages):
                yield _sse(evt)
        except Exception as exc:
            yield _sse({"type": "error", "msg": str(exc)})
        yield _sse({"type": "end"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

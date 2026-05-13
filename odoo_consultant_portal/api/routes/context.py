from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from ...services.context_service import list_files, read_file, write_file, delete_file, _ALLOWED_NAME, normalize_locale

router = APIRouter()


@router.get("/")
async def get_files(locale: str = Query("fr")):
    return list_files(normalize_locale(locale))


@router.get("/file/{name}")
async def get_file(name: str, locale: str = Query("fr")):
    if not _ALLOWED_NAME.match(name):
        raise HTTPException(400, "Nom de fichier invalide")
    try:
        content = read_file(name, normalize_locale(locale))
        return {"name": name, "content": content}
    except FileNotFoundError:
        raise HTTPException(404, f"{name} introuvable")


class SaveBody(BaseModel):
    content: str


@router.put("/file/{name}")
async def put_file(name: str, body: SaveBody, locale: str = Query("fr")):
    if not _ALLOWED_NAME.match(name):
        raise HTTPException(400, "Nom de fichier invalide")
    if len(body.content) > 200_000:
        raise HTTPException(400, "Fichier trop volumineux (max 200 ko)")
    write_file(name, body.content, normalize_locale(locale))
    return {"ok": True}


@router.delete("/file/{name}")
async def del_file(name: str, locale: str = Query("fr")):
    if not _ALLOWED_NAME.match(name):
        raise HTTPException(400, "Nom de fichier invalide")
    delete_file(name, normalize_locale(locale))
    return {"ok": True}

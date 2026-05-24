from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from ..core.database import init_db
from ..core.config import settings
from .routes import sources, profiles, projects, queries, history, ai, context, creator, update, settings as settings_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Better Odoo Assistant", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", f"http://{settings.api_host}:{settings.api_port}"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sources.router, prefix="/api/sources", tags=["sources"])
app.include_router(profiles.router, prefix="/api/profiles", tags=["profiles"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(queries.router, prefix="/api/queries", tags=["queries"])
app.include_router(history.router, prefix="/api/history", tags=["history"])
app.include_router(ai.router,      prefix="/api/ai",      tags=["ai"])
app.include_router(context.router, prefix="/api/context", tags=["context"])
app.include_router(creator.router, prefix="/api/creator", tags=["creator"])
app.include_router(update.router, prefix="/api/update", tags=["update"])
app.include_router(settings_routes.router, prefix="/api/settings", tags=["settings"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# Serve built frontend if dist exists
_dist = settings.frontend_dist
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        return FileResponse(_dist / "index.html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

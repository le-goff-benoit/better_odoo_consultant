"""search_project_source handler — grep in the client custom repository."""
from __future__ import annotations

from typing import Any

REQUIRES_REPO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.skills._shared.source_search import search
    return await search(args, ctx.repo_path, include_enterprise=False)

"""git_show_commit handler — show a commit (header + numstat + diff).

The handler itself doesn't declare a single ``REQUIRES_*`` flag because the
target repo depends on the ``scope`` argument (odoo / enterprise / target /
project). The underlying helper validates that the corresponding path exists
and returns a clean error if it doesn't.
"""
from __future__ import annotations

from typing import Any


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from odoo_consultant_portal.skills._shared.git_ops import show_commit
    return await show_commit(args, ctx.source_path, ctx.repo_path, ctx.target_path)

"""Backward-compatible exports for project module scanning."""

from __future__ import annotations

from ._shared.project_modules import list_project_modules

__all__ = ["list_project_modules"]

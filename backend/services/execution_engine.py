"""Skill execution engine for provider tool calls."""

from __future__ import annotations

import asyncio
import importlib.util
import logging
import os
import shutil
from pathlib import Path
from typing import Optional, TYPE_CHECKING

from .policy_engine import DEFAULT_POLICY_ENGINE
from .skill_loader import DEFAULT_SKILL_LOADER
from .skill_runtime import SkillRuntimeEvent, log_runtime_event, monotonic_ms
from .tool_context import ToolContext

if TYPE_CHECKING:
    from .odoo_client import OdooClient

log = logging.getLogger(__name__)

_SCRIPT_TIMEOUT_SECONDS = 30
_SCRIPT_MAX_STDOUT_CHARS = 32_000
_SCRIPT_MAX_STDERR_CHARS = 4_000

_HANDLER_CACHE: dict = {}
_HANDLER_MISS: set = set()

_TOOL_TO_SKILL_ALIAS = {
    "extract_pdf_text": "runtime_attachment_handler",
    "pdf_to_images": "runtime_attachment_handler",
    "compare_documents": "runtime_attachment_handler",
}

_RESOURCE_CHECKS = (
    ("REQUIRES_ODOO", "odoo", "Connexion Odoo requise pour ce skill — ouvre un projet depuis la page Projets"),
    ("REQUIRES_SOURCE", "source_path", "Sources Odoo non disponibles — installe-les depuis la page Sources"),
    ("REQUIRES_REPO", "repo_path", "Dépôt projet non disponible — clone-le depuis la fiche projet"),
    ("REQUIRES_TARGET", "target_path", "Sources de la version cible non disponibles"),
)


def _handler_requires(handler) -> tuple[str, ...]:
    requirements: list[str] = []
    if getattr(handler, "REQUIRES_ODOO", False):
        requirements.append("odoo")
    if getattr(handler, "REQUIRES_SOURCE", False):
        requirements.append("source")
    if getattr(handler, "REQUIRES_REPO", False):
        requirements.append("repo")
    if getattr(handler, "REQUIRES_TARGET", False):
        requirements.append("target")
    return tuple(requirements)


async def run_skill_script_subprocess(script_path, script_args, skill) -> dict:
    """Run a skill script in a restricted subprocess.

    When the skill manifest declares ``network: false``, the script must run
    inside a network-isolated namespace (``unshare -r -n``). If ``unshare`` is
    unavailable on the host, we refuse to execute rather than silently granting
    network access — fail-loud over fail-open."""
    sandbox_required = not skill.permissions.network
    has_unshare = bool(shutil.which("unshare"))
    cmd = ["python3", str(script_path), *script_args]
    if sandbox_required:
        if not has_unshare:
            log_runtime_event(log, SkillRuntimeEvent(
                type="policy_decision",
                skill=skill.name,
                filename=str(script_path.name) if hasattr(script_path, "name") else str(script_path),
                action="run_script",
                ok=False,
                denied=True,
                permission="network",
                reason="network sandbox unavailable: 'unshare' binary missing — refusing to run script with network=false",
            ))
            return {
                "ok": False,
                "error": (
                    "Sandbox réseau indisponible (binaire 'unshare' absent). "
                    "Le skill déclare network=false : exécution refusée. "
                    "Installer util-linux/unshare ou autoriser explicitement network=true dans le SKILL.md."
                ),
                "sandbox_unavailable": True,
            }
        cmd = ["unshare", "-r", "-n", *cmd]

    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
        "LC_ALL": os.environ.get("LC_ALL", "C.UTF-8"),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
    }
    cwd = str(Path(script_path).parent.parent)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(),
                timeout=_SCRIPT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return {"ok": False, "error": f"Timeout — script tué après {_SCRIPT_TIMEOUT_SECONDS}s"}
        stdout = stdout_b.decode("utf-8", errors="replace")[:_SCRIPT_MAX_STDOUT_CHARS]
        stderr = stderr_b.decode("utf-8", errors="replace")[:_SCRIPT_MAX_STDERR_CHARS]
        return {
            "ok": proc.returncode == 0,
            "exit_code": proc.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "script": str(script_path.name) if hasattr(script_path, "name") else str(script_path),
        }
    except Exception as exc:
        return {"ok": False, "error": f"Échec lancement subprocess : {exc}"}


def resolve_handler(tool_name: str):
    if tool_name in _HANDLER_CACHE:
        return _HANDLER_CACHE[tool_name]
    if tool_name in _HANDLER_MISS:
        return None
    from ..skills.registry import skill_by_name

    skill_lookup = _TOOL_TO_SKILL_ALIAS.get(tool_name, tool_name)
    skill = skill_by_name(skill_lookup)
    if skill is None or not skill.folder:
        _HANDLER_MISS.add(tool_name)
        return None
    handler_path = Path(skill.folder) / "scripts" / "handler.py"
    if not handler_path.is_file():
        _HANDLER_MISS.add(tool_name)
        return None
    mod_name = f"_skill_handler_{tool_name}"
    spec = importlib.util.spec_from_file_location(mod_name, str(handler_path))
    if spec is None or spec.loader is None:
        _HANDLER_MISS.add(tool_name)
        return None
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        log.error("Skill handler import failed for %s: %s", tool_name, exc)
        _HANDLER_MISS.add(tool_name)
        return None
    _HANDLER_CACHE[tool_name] = module
    return module


def _log_policy_decision(decision) -> None:
    log_runtime_event(log, SkillRuntimeEvent(
        type="policy_decision",
        skill=decision.skill,
        filename=decision.filename,
        ok=decision.allowed,
        denied=decision.denied,
        reason=decision.reason,
        permission=decision.permission,
        action=decision.action,
        extra={
            "filesystem": decision.filesystem,
            "scripts": decision.scripts,
            "network": decision.network,
            "odoo": decision.odoo,
        },
    ))


async def run_tool(
    name: str,
    args: dict,
    odoo: Optional["OdooClient"],
    source_path: Optional[str] = None,
    repo_path: Optional[str] = None,
    target_path: Optional[str] = None,
) -> dict:
    loop = asyncio.get_event_loop()
    started_ms = monotonic_ms()
    try:
        if name == "load_skill_reference":
            sk = args.get("skill", "")
            fn = args.get("filename", "")
            loaded = await loop.run_in_executor(None, lambda: DEFAULT_SKILL_LOADER.load_reference(sk, fn))
            canonical = loaded.decision.skill if loaded.decision is not None else sk
            if loaded.decision is not None:
                _log_policy_decision(loaded.decision)
            if not loaded.ok:
                return {"ok": False, "error": loaded.error or f"Référence introuvable : {sk}/references/{fn}"}
            log_runtime_event(log, SkillRuntimeEvent(
                type="reference_loaded",
                skill=canonical,
                filename=fn,
                duration_ms=monotonic_ms() - started_ms,
                ok=True,
            ))
            return {"ok": True, "skill": canonical, "filename": fn, "content": loaded.content}

        if name == "run_skill_script":
            sk = args.get("skill", "")
            fn = args.get("filename", "")
            script_args = [str(a) for a in (args.get("args") or [])]
            loaded = await loop.run_in_executor(None, lambda: DEFAULT_SKILL_LOADER.resolve_script(sk, fn))
            canonical = loaded.decision.skill if loaded.decision is not None else sk
            if loaded.decision is not None:
                _log_policy_decision(loaded.decision)
            if not loaded.ok or loaded.path is None:
                return {"ok": False, "error": loaded.error or f"Script introuvable : {sk}/scripts/{fn}"}
            from ..skills.registry import skill_by_name

            target = skill_by_name(sk)
            if target is None:
                return {"ok": False, "error": f"Skill inconnu : {sk}"}
            result = await run_skill_script_subprocess(loaded.path, script_args, target)
            log_runtime_event(log, SkillRuntimeEvent(
                type="script_executed",
                skill=canonical,
                filename=fn,
                duration_ms=monotonic_ms() - started_ms,
                ok=bool(result.get("ok")),
                extra={"exit_code": result.get("exit_code")},
            ))
            return result

        handler = resolve_handler(name)
        if handler is None:
            return {"ok": False, "error": f"Outil inconnu: {name}"}
        from ..skills.registry import skill_by_name

        skill_name = _TOOL_TO_SKILL_ALIAS.get(name, name)
        skill = skill_by_name(skill_name)
        if skill is not None:
            decision = DEFAULT_POLICY_ENGINE.decide(
                skill,
                "run_handler",
                filename="scripts/handler.py",
                requires=_handler_requires(handler),
            )
            _log_policy_decision(decision)
            if decision.denied:
                return {"ok": False, "error": decision.reason}

        ctx = ToolContext(
            odoo=odoo,
            source_path=source_path,
            repo_path=repo_path,
            target_path=target_path,
            loop=loop,
        )
        for flag, attr, error_msg in _RESOURCE_CHECKS:
            if getattr(handler, flag, False) and getattr(ctx, attr) is None:
                return {"ok": False, "error": error_msg}

        if name in _TOOL_TO_SKILL_ALIAS:
            args = {**args, "_tool": name}
        result = await handler.run(args, ctx)
        log_runtime_event(log, SkillRuntimeEvent(
            type="script_executed",
            skill=skill_name,
            filename="scripts/handler.py",
            duration_ms=monotonic_ms() - started_ms,
            ok=bool(result.get("ok")) if isinstance(result, dict) and "ok" in result else True,
            extra={"tool": name},
        ))
        return result
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

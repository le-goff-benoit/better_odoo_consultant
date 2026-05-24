"""Secure loading of files bundled with application skills."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .policy_engine import DEFAULT_POLICY_ENGINE, PolicyDecision, PolicyEngine
from ..skills.registry import SkillDefinition, skill_by_name

_SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9_-]+\.(md|py)$")


@dataclass(frozen=True)
class SkillLoadResult:
    ok: bool
    decision: Optional[PolicyDecision] = None
    content: Optional[str] = None
    path: Optional[Path] = None
    error: Optional[str] = None


class SkillLoader:
    def __init__(self, policy_engine: PolicyEngine = DEFAULT_POLICY_ENGINE):
        self.policy_engine = policy_engine

    def _resolve(self, skill: SkillDefinition, subdir: str, filename: str, suffix: str) -> Optional[Path]:
        if not skill.folder:
            return None
        if suffix == ".md" and not filename.endswith(".md"):
            filename = f"{filename}.md"
        if not filename.endswith(suffix) or not _SAFE_FILENAME_RE.match(filename):
            return None
        base = Path(skill.folder) / subdir
        target = (base / filename).resolve()
        try:
            target.relative_to(base.resolve())
        except ValueError:
            return None
        if not target.is_file():
            return None
        return target

    def load_reference(
        self,
        name: str,
        filename: str,
        *,
        provider: Optional[str] = None,
        mode: Optional[str] = None,
        enforce_policy: bool = True,
    ) -> SkillLoadResult:
        skill = skill_by_name(name)
        if skill is None:
            return SkillLoadResult(ok=False, error=f"Skill inconnu : {name}")
        decision = self.policy_engine.decide(skill, "load_reference", filename=filename, provider=provider, mode=mode)
        if enforce_policy and not decision.allowed:
            return SkillLoadResult(ok=False, decision=decision, error=decision.reason)
        path = self._resolve(skill, "references", filename, ".md")
        if path is None:
            return SkillLoadResult(ok=False, decision=decision, error=f"Référence introuvable : {name}/references/{filename}")
        return SkillLoadResult(ok=True, decision=decision, content=path.read_text(encoding="utf-8"), path=path)

    def load_template(
        self,
        name: str,
        filename: str,
        *,
        provider: Optional[str] = None,
        mode: Optional[str] = None,
        enforce_policy: bool = True,
    ) -> SkillLoadResult:
        skill = skill_by_name(name)
        if skill is None:
            return SkillLoadResult(ok=False, error=f"Skill inconnu : {name}")
        decision = self.policy_engine.decide(skill, "read_template", filename=filename, provider=provider, mode=mode)
        if enforce_policy and not decision.allowed:
            return SkillLoadResult(ok=False, decision=decision, error=decision.reason)
        path = self._resolve(skill, "templates", filename, ".md")
        if path is None:
            return SkillLoadResult(ok=False, decision=decision, error=f"Template introuvable : {name}/templates/{filename}")
        return SkillLoadResult(ok=True, decision=decision, content=path.read_text(encoding="utf-8"), path=path)

    def load_example(
        self,
        name: str,
        filename: str,
        *,
        provider: Optional[str] = None,
        mode: Optional[str] = None,
        enforce_policy: bool = True,
    ) -> SkillLoadResult:
        skill = skill_by_name(name)
        if skill is None:
            return SkillLoadResult(ok=False, error=f"Skill inconnu : {name}")
        decision = self.policy_engine.decide(skill, "read_example", filename=filename, provider=provider, mode=mode)
        if enforce_policy and not decision.allowed:
            return SkillLoadResult(ok=False, decision=decision, error=decision.reason)
        path = self._resolve(skill, "examples", filename, ".md")
        if path is None:
            return SkillLoadResult(ok=False, decision=decision, error=f"Exemple introuvable : {name}/examples/{filename}")
        return SkillLoadResult(ok=True, decision=decision, content=path.read_text(encoding="utf-8"), path=path)

    def resolve_script(self, name: str, filename: str, *, provider: Optional[str] = None, mode: Optional[str] = None) -> SkillLoadResult:
        skill = skill_by_name(name)
        if skill is None:
            return SkillLoadResult(ok=False, error=f"Skill inconnu : {name}")
        decision = self.policy_engine.decide(skill, "run_script", filename=filename, provider=provider, mode=mode)
        if not decision.allowed:
            return SkillLoadResult(ok=False, decision=decision, error=decision.reason)
        path = self._resolve(skill, "scripts", filename, ".py")
        if path is None:
            return SkillLoadResult(ok=False, decision=decision, error=f"Script introuvable : {name}/scripts/{filename}")
        return SkillLoadResult(ok=True, decision=decision, path=path)


DEFAULT_SKILL_LOADER = SkillLoader()

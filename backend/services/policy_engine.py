"""Declarative permission checks for skill runtime actions."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Literal, Optional

if TYPE_CHECKING:
    from ..skills.registry import SkillDefinition

PolicyAction = Literal[
    "load_reference",
    "read_template",
    "read_example",
    "run_script",
    "run_handler",
]


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    action: PolicyAction
    skill: str
    filename: Optional[str] = None
    reason: str = ""
    permission: Optional[str] = None
    provider: Optional[str] = None
    mode: Optional[str] = None
    filesystem: str = "none"
    scripts: bool = False
    network: bool = False
    odoo: str = "none"

    @property
    def denied(self) -> bool:
        return not self.allowed

    def to_dict(self) -> dict:
        data = asdict(self)
        data["denied"] = self.denied
        return {k: v for k, v in data.items() if v not in (None, "")}


class PolicyEngine:
    """Evaluate whether a skill action is allowed by frontmatter permissions."""

    def decide(
        self,
        skill: "SkillDefinition",
        action: PolicyAction,
        *,
        filename: Optional[str] = None,
        provider: Optional[str] = None,
        mode: Optional[str] = None,
        requires: tuple[str, ...] = (),
    ) -> PolicyDecision:
        permissions = skill.permissions
        base = {
            "action": action,
            "skill": skill.name,
            "filename": filename,
            "provider": provider,
            "mode": mode,
            "filesystem": permissions.filesystem,
            "scripts": permissions.scripts,
            "network": permissions.network,
            "odoo": permissions.odoo,
        }

        if action in ("load_reference", "read_template", "read_example"):
            if permissions.filesystem not in ("read", "write"):
                return PolicyDecision(
                    allowed=False,
                    reason="filesystem read permission required",
                    permission="filesystem",
                    **base,
                )
            return PolicyDecision(
                allowed=True,
                reason="filesystem read permitted",
                permission="filesystem",
                **base,
            )

        if action == "run_script":
            if not permissions.scripts:
                return PolicyDecision(
                    allowed=False,
                    reason="scripts permission required",
                    permission="scripts",
                    **base,
                )
            return PolicyDecision(
                allowed=True,
                reason="script execution permitted; network remains disabled unless explicitly granted",
                permission="scripts",
                **base,
            )

        if action == "run_handler":
            if "odoo" in requires and permissions.odoo == "none":
                return PolicyDecision(
                    allowed=False,
                    reason="odoo permission required by handler",
                    permission="odoo",
                    **base,
                )
            if any(req in requires for req in ("source", "repo", "target")) and permissions.filesystem not in ("read", "write"):
                return PolicyDecision(
                    allowed=False,
                    reason="filesystem read permission required by handler",
                    permission="filesystem",
                    **base,
                )
            return PolicyDecision(
                allowed=True,
                reason="handler permissions match declared runtime resources",
                permission="toolset",
                **base,
            )

        return PolicyDecision(
            allowed=False,
            reason=f"unsupported policy action: {action}",
            **base,
        )


DEFAULT_POLICY_ENGINE = PolicyEngine()

"""Output template selection for skill-backed deliverables."""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from typing import Optional

from .skill_loader import DEFAULT_SKILL_LOADER, SkillLoader
from ..skills.registry import SKILL_DEFINITIONS, normalize_disabled_skill_names

_logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OutputTemplateSelection:
    skill_name: str
    template_name: str
    label: str
    body: str
    score: int
    reason: str
    output_type: str = "markdown"

    def to_public_dict(self) -> dict:
        data = asdict(self)
        data["skill"] = data.pop("skill_name")
        data["template"] = data.pop("template_name")
        data.pop("body", None)
        data.pop("output_type", None)
        return data


class OutputRenderer:
    """Select and render Markdown output templates declared by skills."""

    def __init__(self, loader: SkillLoader = DEFAULT_SKILL_LOADER):
        self.loader = loader

    @staticmethod
    def _normalize(text: Optional[str]) -> str:
        return (text or "").casefold()

    def select_template(
        self,
        prompt: str,
        disabled_tools: Optional[list[str]] = None,
        *,
        provider: Optional[str] = None,
        mode: Optional[str] = None,
        agent: Optional[str] = None,
    ) -> Optional[OutputTemplateSelection]:
        """Select the best output template for the prompt.

        Resolution order :
        1. Build all candidate (skill, template, trigger) matches.
        2. Drop any template whose ``forbidden_agents`` contains the active
           ``agent`` — e.g. ``technical_review`` is forbidden for the BA agent
           because it pushes file:line + Python patch slots that don't fit a
           business framing.
        3. Boost templates whose ``preferred_agents`` contains ``agent`` so
           ``business_impact_review`` wins over ``technical_review`` when both
           match an "audit" / "revue" prompt and the BA is the active agent.
        4. Score = `100 + len(trigger) + (50 if agent-preferred else 0)`.
        5. Pick the best score ; ties broken by skill/template declaration order.
        """
        disabled, _ignored_locked = normalize_disabled_skill_names(disabled_tools)
        disabled_set = set(disabled)
        prompt_norm = self._normalize(prompt)
        agent_norm = (agent or "").strip()

        candidates: list[tuple[int, str, str, str, str]] = []  # (score, skill_name, template_name, trigger, label)
        for skill in SKILL_DEFINITIONS:
            if skill.name in disabled_set or not skill.templates:
                continue
            for template in skill.templates:
                if agent_norm and agent_norm in template.forbidden_agents:
                    continue
                preferred_hit = bool(agent_norm and agent_norm in template.preferred_agents)
                for trigger in template.triggers:
                    trigger_norm = self._normalize(trigger)
                    if not trigger_norm or trigger_norm not in prompt_norm:
                        continue
                    score = 100 + len(trigger_norm) + (50 if preferred_hit else 0)
                    candidates.append((score, skill.name, template.name, trigger, template.label))
                    break  # one trigger match per template is enough
        if not candidates:
            return None
        candidates.sort(key=lambda x: (-x[0],))
        score, skill_name, template_name, trigger, label = candidates[0]
        result = self.loader.load_template(skill_name, template_name, provider=provider, mode=mode)
        if not result.ok or not result.content:
            _logger.info("Output template skipped: skill=%s template=%s reason=%s", skill_name, template_name, result.error)
            return None
        return OutputTemplateSelection(
            skill_name=skill_name,
            template_name=template_name,
            label=label,
            body=result.content,
            score=score,
            reason=f"trigger:{trigger}" + (f" + agent:{agent_norm}" if agent_norm else ""),
        )

    @staticmethod
    def render_priority_block(selection: OutputTemplateSelection) -> str:
        return (
            "## FORMAT DE SORTIE — utilise ce template à la lettre\n\n"
            f"(Template `{selection.template_name}` fourni par le skill "
            f"`{selection.skill_name}`. Ne change pas l'ordre ou l'intitulé "
            "des sections. Remplis les `{{ placeholders }}`.)\n\n"
            f"{selection.body.strip()}"
        )


DEFAULT_OUTPUT_RENDERER = OutputRenderer()

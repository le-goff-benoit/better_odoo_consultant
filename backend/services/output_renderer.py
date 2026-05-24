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
    ) -> Optional[OutputTemplateSelection]:
        disabled, _ignored_locked = normalize_disabled_skill_names(disabled_tools)
        disabled_set = set(disabled)
        prompt_norm = self._normalize(prompt)

        for skill in SKILL_DEFINITIONS:
            if skill.name in disabled_set or not skill.templates:
                continue
            for template in skill.templates:
                for trigger in template.triggers:
                    trigger_norm = self._normalize(trigger)
                    if not trigger_norm or trigger_norm not in prompt_norm:
                        continue
                    result = self.loader.load_template(
                        skill.name,
                        template.name,
                        provider=provider,
                        mode=mode,
                    )
                    if not result.ok or not result.content:
                        _logger.info(
                            "Output template skipped: skill=%s template=%s reason=%s",
                            skill.name,
                            template.name,
                            result.error,
                        )
                        return None
                    return OutputTemplateSelection(
                        skill_name=skill.name,
                        template_name=template.name,
                        label=template.label,
                        body=result.content,
                        score=100 + len(trigger_norm),
                        reason=f"trigger:{trigger}",
                    )
        return None

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

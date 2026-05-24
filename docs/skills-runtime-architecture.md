# Skills Runtime Architecture

Date: 2026-05-24

## Runtime Model

The application owns the skill runtime.

- Skills are packages under `skills/<slug>/`.
- Providers are interchangeable LLM engines.
- `backend_emulated` is the default and only active execution mode.
- Native OpenAI/Anthropic skills are not enabled in production yet.

## Main Components

- `skills/manifest.py` parses and validates `SKILL.md`.
- `skills/registry.py` discovers skills and exposes the catalog.
- `services/context_service.py` routes prompts to skill playbooks and builds bounded context.
- `services/toolset_builder.py` builds provider-specific toolsets from shared inputs.
- `services/provider_adapters.py` declares provider capabilities, tool format and execution mode.
- `services/policy_engine.py` decides whether runtime actions are allowed.
- `services/skill_loader.py` loads references, templates, examples and scripts safely.
- `services/execution_engine.py` executes meta-tools, handlers and scripts.
- `services/output_renderer.py` selects Markdown output templates.
- `services/skill_runtime.py` collects structured runtime events.
- `services/ai_service.py` now remains the provider streaming entrypoint.

## Execution Flow

1. `context_service` builds context and records routed skill candidates.
2. `output_renderer` optionally injects one Markdown output template.
3. `toolset_builder` exposes only tools valid for the provider and runtime mode.
4. `provider_adapter` selects the Claude/OpenAI/Gemini tool format.
5. The provider streams tool calls back to `ai_service`.
6. `execution_engine` runs handlers or meta-tools through `PolicyEngine` and `SkillLoader`.
7. `skill_runtime` emits provider, policy, file-load, script/handler and completion events.

## Provider Mode

All current providers use:

```text
execution_mode = backend_emulated
```

Provider-native skills remain a future optimization. Before enabling `native`,
the backend must keep the same observable events and policy guarantees, because
the application runtime is the compatibility baseline.

## Phase 7 Completion Criteria

- Skill execution no longer lives in `ai_service.py`.
- Runtime events still cover provider calls, policy decisions, file loads,
  script/handler execution and completion.
- The backend-emulated path stays compatible with Claude, OpenAI, Gemini,
  GitHub Models and Copilot.
- The full backend test suite passes.

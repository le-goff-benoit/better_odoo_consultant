# Skills Runtime — Phase 5/6 Evaluation

Date: 2026-05-24

## Scope

Phase 5 and 6 are merged in this pass:

- evaluate pilot skills in the current backend-emulated runtime;
- migrate all 28 `SKILL.md` manifests toward trigger-oriented descriptions;
- declare explicit runtime permissions for references, templates and scripts;
- add regression tests so future skill edits keep progressive disclosure intact.

No provider-native skill mode is enabled here.

## Pilot Results

### `repo_read_file`

- Positive trigger: repository/file/manifest prompts route to `repo_read_file`.
- Negative trigger: generic Odoo workflow prompts do not select it.
- Runtime contract: `filesystem=read`, `scripts=false`, `odoo=none`.
- Expected use: after `repo_search_code` or `repo_list_modules`, to read exact files and cite lines.

### `odoo_inspect_studio`

- Positive trigger: Studio audit, `x_studio`, automations and migration-limit prompts route to `odoo_inspect_studio`.
- Negative trigger: KPI/count prompts do not select it.
- Runtime contract: `filesystem=read`, `scripts=true`, `odoo=read`.
- Expected use: advanced pilot for references, policy, live Odoo reads and script helpers.

### `output_report_writer`

- Positive trigger: deliverable prompts such as technical review select the matching output template.
- Negative trigger: short Q/A prompts do not inject a template.
- Runtime contract: `filesystem=read`, `scripts=false`, `odoo=none`.
- Expected use: standardize Markdown deliverables without forcing a format on conversational answers.

## Catalog Migration Rules Applied

- Every skill description now starts with an activation rule: `Utiliser ce skill...`.
- Every English description mirrors that trigger style: `Use this skill...`.
- Every skill declares `permissions` explicitly.
- `network` remains `false` everywhere.
- Scripts stay disabled except where deterministic helpers are intentionally exposed:
  `runtime_attachment_handler`, `odoo_inspect_studio`, `repo_list_modules`, `odoo_query_records`.
- Long material remains outside descriptions and in `references/`, `templates/`, `examples/` or scripts.

## Guardrails

The test suite now checks:

- trigger-oriented descriptions for every skill;
- explicit permission blocks for every skill;
- bounded `SKILL.md` bodies to preserve progressive disclosure;
- positive and negative routing for the three pilots;
- template injection only for deliverable prompts;
- runtime strict loading of migrated references.

## Remaining Phase 7 Inputs

Before a final refactor or native provider mode, collect real chat traces for:

- false positive skill routing;
- false negative skill routing;
- provider variance on the same prompt;
- runtime events for denied policy decisions;
- token/cost impact of richer descriptions;
- user-facing quality of `output_report_writer` templates.

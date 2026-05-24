# AGENTS.md

## Project Instructions

Before making changes, read `CLAUDE.md` and follow the project conventions described there.

If there is a conflict:
1. User instructions in the current prompt have priority.
2. Then follow this `AGENTS.md`.
3. Then follow `CLAUDE.md`.

## Versioning Maintenance

Whenever the application version is incremented, the AI agent must keep the project documentation and release metadata coherent in the same change set:

1. Update the About page changelog.
2. Update `README.md`.
3. Update `CLAUDE.md`.
4. Update this `AGENTS.md` if agent/versioning instructions changed or if the current app version is referenced.
5. Commit and push the changes on the current Git branch, unless the user explicitly asks not to.

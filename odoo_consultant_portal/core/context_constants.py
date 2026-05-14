"""Shared context-management constants.

All budget and sizing limits are defined here and imported by both
ai_service.py and context_service.py to avoid drift between the two files.
"""

# ── Markdown context budget ───────────────────────────────────────
# Maximum characters assembled by load_context_for_prompt() (≈ 9k tokens).
CONTEXT_BUDGET_CHARS: int = 36_000

# Hard cap applied by _trim_context() before injection into the system prompt.
# The extra 4k chars give room for the system-prompt scaffolding added around
# the context block (headers, separators, project context overflow).
MAX_CONTEXT_CHARS: int = 40_000

# ── Project context ───────────────────────────────────────────────
# Free-text per-project notes field — trimmed before injection.
MAX_PROJECT_CONTEXT_CHARS: int = 12_000

# ── Conversation history trimming ────────────────────────────────
# Maximum number of *user+assistant turn pairs* retained in the messages list
# sent to providers. Older turns are dropped (newest-first strategy).
# At 20 turns × ~2 000 chars/turn ≈ 40k chars ≈ 10k tokens for history.
MAX_HISTORY_TURNS: int = 20

# ── Tool result compression ───────────────────────────────────────
# When a tool result is appended to the messages array that will be kept
# across future turns, its JSON representation is capped at this many chars.
# The *full* result is still streamed to the frontend via SSE — only the
# copy stored in the ongoing conversation is compressed to prevent overflow.
MAX_TOOL_RESULT_HISTORY_CHARS: int = 2_000

# ── Model output tokens ───────────────────────────────────────────
# Claude was previously hard-coded to 4 096 tokens which silently truncated
# Studio audits and long migration analyses.
CLAUDE_MAX_OUTPUT_TOKENS: int = 8_192

# Gemini has no explicit cap by default — set one to avoid runaway responses.
GEMINI_MAX_OUTPUT_TOKENS: int = 8_192

"""Lightweight semantic fallback for the skill dispatcher.

Pure-Python TF-IDF + cosine similarity over each skill's
``description + description_en + keywords + name`` corpus. No external
dependency, no network — fully aligned with the local-first product
principle. Built once at import time from ``SKILL_DEFINITIONS`` (also
re-buildable on hot-reload via ``rebuild_index``).

The router is intentionally **a fallback only**: the deterministic lexical
dispatcher (`_select_skill_playbooks`) keeps the lead, and this module only
contributes when no skill scores above the keyword threshold (60). When that
happens, the top-k skills by cosine similarity (>= ``_MIN_COSINE``) are
returned with a moderate score (``_FALLBACK_SCORE = 50``) so they sit just
under keyword matches but above mode-defaults — enough to surface relevant
playbooks on natural-language phrasings the keyword lists missed.

Set env var ``BETTER_SEMANTIC_ROUTER=0`` to disable entirely.
"""
from __future__ import annotations

import logging
import math
import os
import re
from dataclasses import dataclass
from typing import Iterable, Optional

_logger = logging.getLogger(__name__)

# Tunables — kept conservative on purpose so the semantic layer cannot
# overrule a strong lexical match.
_MIN_COSINE = 0.12
_FALLBACK_SCORE = 50  # below keyword=60, above mode-default=25
_TOP_K = 3
_KEYWORD_MAX_LEXICAL = 60  # only run semantic when *no* skill ≥ this score

# Tokenizer accepts unicode word characters; treats ascii apostrophe and
# hyphen as token separators so "facture client" → ["facture", "client"]
# and "x_studio" → ["x", "studio"]. Stop-words intentionally minimal — we
# trust TF-IDF to demote common terms.
_TOKEN_RE = re.compile(r"[a-zA-Z0-9À-ſ]+", re.UNICODE)
_STOP_FR = {
    "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "à",
    "au", "aux", "en", "dans", "pour", "par", "que", "qui", "quoi", "ce",
    "cet", "cette", "ces", "se", "sa", "son", "ses", "est", "sont", "sur",
    "avec", "sans", "comme", "comment", "pourquoi",
}
_STOP_EN = {
    "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "by",
    "with", "without", "is", "are", "was", "were", "be", "this", "that",
    "these", "those", "as", "how", "why", "what",
}
_STOPWORDS = _STOP_FR | _STOP_EN


def _tokenize(text: str) -> list[str]:
    if not text:
        return []
    toks = [t.casefold() for t in _TOKEN_RE.findall(text)]
    return [t for t in toks if len(t) > 1 and t not in _STOPWORDS]


@dataclass(frozen=True)
class _SkillVector:
    name: str
    tfidf: dict[str, float]
    norm: float


@dataclass(frozen=True)
class SemanticHit:
    name: str
    cosine: float
    score: int


class _SemanticIndex:
    """In-memory TF-IDF index over the skill catalogue.

    Rebuildable cheaply (<5 ms for ~40 skills) so we can call
    ``rebuild_index`` after hot-reloading the skill registry in tests.
    """

    def __init__(self) -> None:
        self._enabled = os.environ.get("BETTER_SEMANTIC_ROUTER", "1") != "0"
        self._vectors: list[_SkillVector] = []
        self._idf: dict[str, float] = {}
        self._built = False

    def enabled(self) -> bool:
        return self._enabled and self._built

    def build(self, skills: Iterable[object]) -> None:
        """Build the index from skill definitions (duck-typed: we read
        ``name``, ``description``, ``description_en``, ``keywords``)."""
        docs: list[tuple[str, list[str]]] = []
        for skill in skills:
            name = getattr(skill, "name", None)
            if not name:
                continue
            parts: list[str] = [
                str(name).replace("_", " "),
                str(getattr(skill, "description", "") or ""),
                str(getattr(skill, "description_en", "") or ""),
                " ".join(str(k) for k in getattr(skill, "keywords", ()) or ()),
            ]
            tokens = _tokenize(" ".join(parts))
            if tokens:
                docs.append((str(name), tokens))

        if not docs:
            self._vectors = []
            self._idf = {}
            self._built = False
            return

        n_docs = len(docs)
        df: dict[str, int] = {}
        for _, toks in docs:
            for term in set(toks):
                df[term] = df.get(term, 0) + 1
        # Smoothed IDF
        self._idf = {term: math.log((n_docs + 1) / (count + 1)) + 1 for term, count in df.items()}

        vectors: list[_SkillVector] = []
        for name, toks in docs:
            tf: dict[str, int] = {}
            for term in toks:
                tf[term] = tf.get(term, 0) + 1
            tfidf: dict[str, float] = {}
            for term, count in tf.items():
                idf = self._idf.get(term, 0.0)
                if idf <= 0:
                    continue
                tfidf[term] = (count / len(toks)) * idf
            norm = math.sqrt(sum(v * v for v in tfidf.values())) or 1.0
            vectors.append(_SkillVector(name=name, tfidf=tfidf, norm=norm))

        self._vectors = vectors
        self._built = True

    def query(self, text: str, *, top_k: int = _TOP_K, min_cosine: float = _MIN_COSINE) -> list[SemanticHit]:
        """Return the top-k skills whose cosine similarity to ``text``
        meets ``min_cosine``. Returns [] if disabled or index empty."""
        if not self._enabled or not self._built or not self._vectors:
            return []
        tokens = _tokenize(text)
        if not tokens:
            return []
        # Build query TF-IDF
        tf: dict[str, int] = {}
        for term in tokens:
            tf[term] = tf.get(term, 0) + 1
        q_vec: dict[str, float] = {}
        for term, count in tf.items():
            idf = self._idf.get(term)
            if not idf:
                continue
            q_vec[term] = (count / len(tokens)) * idf
        if not q_vec:
            return []
        q_norm = math.sqrt(sum(v * v for v in q_vec.values())) or 1.0

        scored: list[tuple[str, float]] = []
        for sv in self._vectors:
            # Iterate over the smaller dict for speed.
            small, large = (q_vec, sv.tfidf) if len(q_vec) <= len(sv.tfidf) else (sv.tfidf, q_vec)
            dot = 0.0
            for term, weight in small.items():
                other = large.get(term)
                if other:
                    dot += weight * other
            if dot <= 0:
                continue
            cosine = dot / (q_norm * sv.norm)
            if cosine >= min_cosine:
                scored.append((sv.name, cosine))
        scored.sort(key=lambda x: (-x[1], x[0]))
        return [
            SemanticHit(name=name, cosine=round(cos, 4), score=_FALLBACK_SCORE)
            for name, cos in scored[:top_k]
        ]


_INDEX = _SemanticIndex()


@dataclass(frozen=True)
class AgentSemanticHit:
    name: str
    cosine: float


class _AgentSemanticIndex(_SemanticIndex):
    """TF-IDF index over the agent catalogue.

    Reuses ``_SemanticIndex`` machinery but builds its corpus from agent
    ``description + description_en + auto_keywords.weak + auto_keywords.strong``.
    Used by ``_infer_perspective`` as a tie-breaker when the deterministic
    lexical scorer is below threshold or has a low margin — catches paraphrases
    where the explicit keywords miss but the overall vocabulary still
    matches an agent's domain.
    """

    def build(self, agents: Iterable[object]) -> None:  # type: ignore[override]
        docs: list[tuple[str, list[str]]] = []
        for ag in agents:
            name = getattr(ag, "name", None)
            if not name:
                continue
            kw = getattr(ag, "auto_keywords", None)
            weak = getattr(kw, "weak", ()) if kw else ()
            strong = getattr(kw, "strong", ()) if kw else ()
            parts: list[str] = [
                str(name).replace("_", " "),
                str(getattr(ag, "description", "") or ""),
                str(getattr(ag, "description_en", "") or ""),
                " ".join(weak),
                # repeat strong terms so they outweigh weak in TF
                " ".join(strong) + " " + " ".join(strong),
            ]
            tokens = _tokenize(" ".join(parts))
            if tokens:
                docs.append((str(name), tokens))

        if not docs:
            self._vectors = []
            self._idf = {}
            self._built = False
            return

        n_docs = len(docs)
        df: dict[str, int] = {}
        for _, toks in docs:
            for term in set(toks):
                df[term] = df.get(term, 0) + 1
        self._idf = {term: math.log((n_docs + 1) / (count + 1)) + 1 for term, count in df.items()}

        vectors: list[_SkillVector] = []
        for name, toks in docs:
            tf: dict[str, int] = {}
            for term in toks:
                tf[term] = tf.get(term, 0) + 1
            tfidf: dict[str, float] = {}
            for term, count in tf.items():
                idf = self._idf.get(term, 0.0)
                if idf <= 0:
                    continue
                tfidf[term] = (count / len(toks)) * idf
            norm = math.sqrt(sum(v * v for v in tfidf.values())) or 1.0
            vectors.append(_SkillVector(name=name, tfidf=tfidf, norm=norm))
        self._vectors = vectors
        self._built = True


_AGENT_INDEX = _AgentSemanticIndex()


def rebuild_agent_index(agents: Optional[Iterable[object]] = None) -> None:
    """Rebuild the semantic agent index. If ``agents`` is None, pull the
    current agent registry."""
    if agents is None:
        try:
            from ..agents import list_agents as _list_agents
            agents = _list_agents()
        except Exception as exc:  # pragma: no cover
            _logger.warning("Cannot load agent registry for semantic index: %s", exc)
            return
    _AGENT_INDEX.build(agents)


def semantic_agent_vote(prompt: str, *, min_cosine: float = 0.10) -> Optional[AgentSemanticHit]:
    """Return the top agent by cosine similarity, or None if no agent clears
    ``min_cosine``. Used by ``_infer_perspective`` as a fallback / tie-breaker
    when lexical scoring is low-confidence."""
    if not _AGENT_INDEX.enabled():
        return None
    hits = _AGENT_INDEX.query(prompt, top_k=1, min_cosine=min_cosine)
    if not hits:
        return None
    h = hits[0]
    return AgentSemanticHit(name=h.name, cosine=h.cosine)


# Lazy build at import time, swallow failures.
try:
    rebuild_agent_index()
except Exception as exc:  # pragma: no cover
    _logger.warning("Initial agent semantic index build failed: %s", exc)


def rebuild_index(skills: Optional[Iterable[object]] = None) -> None:
    """Rebuild the semantic index. If ``skills`` is None, the function
    pulls ``SKILL_DEFINITIONS`` from the skill registry — kept lazy to avoid
    import-cycle issues at module load time."""
    if skills is None:
        try:
            from ..skills.registry import SKILL_DEFINITIONS as _skills
            skills = _skills
        except Exception as exc:  # pragma: no cover — registry load failure is fatal elsewhere
            _logger.warning("Cannot load SKILL_DEFINITIONS for semantic index: %s", exc)
            return
    _INDEX.build(skills)


def is_enabled() -> bool:
    return _INDEX.enabled()


def semantic_fallback(prompt: str, *, top_k: int = _TOP_K) -> list[SemanticHit]:
    """Run the semantic fallback over the current skill catalogue. Returns
    an empty list if disabled or if no skill clears ``_MIN_COSINE``."""
    return _INDEX.query(prompt, top_k=top_k)


def should_run_semantic(top_lexical_score: int) -> bool:
    """Gate predicate: only run the semantic fallback when the deterministic
    lexical dispatcher hasn't found a confident match."""
    if not _INDEX.enabled():
        return False
    return top_lexical_score < _KEYWORD_MAX_LEXICAL


# Build the index lazily on first import. Failures are non-fatal — the
# dispatcher gracefully degrades to lexical-only routing.
try:
    rebuild_index()
except Exception as exc:  # pragma: no cover
    _logger.warning("Initial semantic index build failed: %s", exc)

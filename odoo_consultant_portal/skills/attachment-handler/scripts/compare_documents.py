#!/usr/bin/env python3
"""compare_documents.py — compare two PDFs by extracted text (pypdf + difflib).

Usage:
    compare_documents.py file_a.pdf file_b.pdf [--mode text|structure]

Sortie : JSON sur stdout. Code retour 0 si OK, 2 si erreur.
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys


def _extract_text(path: str) -> str:
    import pypdf
    reader = pypdf.PdfReader(path)
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def _split_sections(text: str) -> list[tuple[str, str]]:
    """Split text into (heading, body) pairs by Markdown-like headings or
    numbered patterns (1., 1.1., I., II.). Returns one ('', full_text) if no
    headings detected."""
    pattern = re.compile(
        r"(?m)^(?:#{1,4}\s+.+|(?:\d+(?:\.\d+)*|[IVXLC]+)\.?\s+[A-ZÉÈÀ][^\n]{2,80})$"
    )
    matches = list(pattern.finditer(text))
    if not matches:
        return [("", text.strip())]
    sections: list[tuple[str, str]] = []
    starts = [m.start() for m in matches] + [len(text)]
    for i, m in enumerate(matches):
        heading = m.group().strip()
        body = text[m.end():starts[i + 1]].strip()
        sections.append((heading, body))
    return sections


def compare(path_a: str, path_b: str, mode: str) -> dict:
    try:
        text_a = _extract_text(path_a)
        text_b = _extract_text(path_b)
    except ImportError:
        return {"ok": False, "error": "pypdf manquant — pip install pypdf"}
    except Exception as exc:
        return {"ok": False, "error": f"Lecture PDF impossible : {exc}"}

    if mode == "text":
        diff = list(difflib.unified_diff(
            text_a.splitlines(), text_b.splitlines(),
            fromfile=path_a, tofile=path_b, lineterm="", n=2,
        ))
        ratio = difflib.SequenceMatcher(None, text_a, text_b).ratio()
        return {
            "ok": True,
            "mode": "text",
            "similarity": round(ratio, 3),
            "diff_lines": len(diff),
            "diff": "\n".join(diff[:500]),
            "truncated": len(diff) > 500,
        }

    if mode == "structure":
        sections_a = _split_sections(text_a)
        sections_b = _split_sections(text_b)
        headings_a = {h.lower(): body for h, body in sections_a}
        headings_b = {h.lower(): body for h, body in sections_b}
        all_keys = list(dict.fromkeys(list(headings_a) + list(headings_b)))
        diff: list[dict] = []
        for k in all_keys:
            a, b = headings_a.get(k), headings_b.get(k)
            if a is None:
                diff.append({"section": k, "status": "ajouté dans B", "details": None})
            elif b is None:
                diff.append({"section": k, "status": "retiré dans B", "details": None})
            elif a.strip() == b.strip():
                diff.append({"section": k, "status": "identique", "details": None})
            else:
                ratio = difflib.SequenceMatcher(None, a, b).ratio()
                diff.append({
                    "section": k,
                    "status": "modifié",
                    "similarity": round(ratio, 3),
                    "details": f"{abs(len(a)-len(b))} chars d'écart",
                })
        return {
            "ok": True,
            "mode": "structure",
            "sections_a": [h for h, _ in sections_a],
            "sections_b": [h for h, _ in sections_b],
            "diff": diff,
        }

    return {"ok": False, "error": f"Mode inconnu : {mode} (attendu : text | structure)"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("path_a")
    parser.add_argument("path_b")
    parser.add_argument("--mode", default="text", choices=["text", "structure"])
    args = parser.parse_args()

    result = compare(args.path_a, args.path_b, args.mode)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    sys.exit(main())

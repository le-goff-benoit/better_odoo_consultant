#!/usr/bin/env python3
"""extract_pdf_text.py — best-effort text extraction from a local PDF via pypdf.

Usage:
    extract_pdf_text.py path/to/file.pdf [--pages 1,2,3]

Sortie : JSON sur stdout. Code retour 0 si OK, 2 si erreur.
"""
from __future__ import annotations

import argparse
import json
import sys


def extract(path: str, pages_filter: list[int] | None = None) -> dict:
    try:
        import pypdf
    except ImportError:
        return {"ok": False, "error": "pypdf manquant — pip install pypdf"}
    try:
        reader = pypdf.PdfReader(path)
    except Exception as exc:
        return {"ok": False, "error": f"Lecture PDF impossible : {exc}"}
    total_pages = len(reader.pages)
    target = pages_filter or list(range(1, total_pages + 1))
    extracted: list[tuple[int, str]] = []
    for page_num in target:
        if page_num < 1 or page_num > total_pages:
            continue
        try:
            t = (reader.pages[page_num - 1].extract_text() or "").strip()
        except Exception:
            t = ""
        if t:
            extracted.append((page_num, t))
    body = "\n\n".join(f"--- Page {n} ---\n\n{t}" for n, t in extracted)
    return {
        "ok": True,
        "path": path,
        "total_pages": total_pages,
        "extracted_pages": len(extracted),
        "char_count": len(body),
        "content": body,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("path", help="Chemin vers le fichier PDF")
    parser.add_argument("--pages", default="",
                        help="Pages à extraire (ex. '1,2,5-7'). Défaut : toutes.")
    args = parser.parse_args()

    pages_filter: list[int] | None = None
    if args.pages.strip():
        pages_filter = []
        for tok in args.pages.split(","):
            tok = tok.strip()
            if "-" in tok:
                a, b = tok.split("-", 1)
                pages_filter.extend(range(int(a), int(b) + 1))
            elif tok:
                pages_filter.append(int(tok))

    result = extract(args.path, pages_filter)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    sys.exit(main())

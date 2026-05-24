#!/usr/bin/env python3
"""pdf_to_images.py — convert PDF pages to PNG via pdf2image (requires poppler).

Usage:
    pdf_to_images.py path/to/file.pdf [--pages 1,2,3] [--dpi 120] [--out-dir /tmp/out]

Sortie : JSON sur stdout listant les fichiers générés (et un base64 si --inline).
Code retour 0 si OK, 2 si erreur.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys


def convert(path: str, pages_filter: list[int] | None, dpi: int, out_dir: str | None, inline: bool) -> dict:
    try:
        from pdf2image import convert_from_path
    except ImportError:
        return {"ok": False, "error": "pdf2image manquant — pip install pdf2image (et apt install poppler-utils)"}
    try:
        if pages_filter:
            first, last = min(pages_filter), max(pages_filter)
            images = convert_from_path(path, dpi=dpi, first_page=first, last_page=last, fmt="png")
            selected_pages = sorted(set(pages_filter))
            offset = first - 1
            images = [img for idx, img in enumerate(images, start=first) if idx in selected_pages]
        else:
            images = convert_from_path(path, dpi=dpi, fmt="png")
            selected_pages = list(range(1, len(images) + 1))
    except Exception as exc:
        return {"ok": False, "error": f"Conversion impossible (poppler installé ?) : {exc}"}

    out_files: list[str] = []
    inline_blocks: list[dict] = []
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    for page_num, img in zip(selected_pages, images):
        if out_dir:
            fname = os.path.join(out_dir, f"page_{page_num:03d}.png")
            img.save(fname, format="PNG")
            out_files.append(fname)
        if inline:
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            inline_blocks.append({
                "page": page_num,
                "mime_type": "image/png",
                "base64": base64.b64encode(buf.getvalue()).decode("ascii"),
            })
    return {
        "ok": True,
        "path": path,
        "pages_rendered": len(images),
        "dpi": dpi,
        "files": out_files,
        "inline": inline_blocks if inline else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("path", help="Chemin vers le fichier PDF")
    parser.add_argument("--pages", default="",
                        help="Pages à convertir (ex. '1,2,5-7'). Défaut : toutes.")
    parser.add_argument("--dpi", type=int, default=120, help="DPI de rendu (défaut 120)")
    parser.add_argument("--out-dir", default="",
                        help="Dossier de sortie (défaut : aucun fichier écrit)")
    parser.add_argument("--inline", action="store_true",
                        help="Inclure le base64 PNG dans la sortie JSON")
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

    result = convert(args.path, pages_filter, args.dpi, args.out_dir or None, args.inline)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    sys.exit(main())

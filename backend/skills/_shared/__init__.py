"""Helpers partagés entre skills outils.

Le préfixe `_shared/` signale au loader (`registry._discover_skill_folders`)
que ce dossier n'est pas un skill — il ne contient pas de `SKILL.md`. Les
handlers individuels importent depuis ici les fonctions utilisées par
plusieurs skills (recherche de source, git, comptage de lignes, manifests).
"""

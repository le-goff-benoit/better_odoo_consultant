<!--
INSTRUCTIONS AUTEUR (ne pas reproduire dans la réponse) :
- Public cible : développeur / architecte / tech lead.
- Si une section n'a pas de contenu réel, **supprime-la entièrement** plutôt que d'écrire « Aucun » ou « Vide ».
- N'ajoute jamais de bloc « Correction proposée » s'il n'y a pas de patch de code à proposer.
- Les lignes commençant par `<!--` et terminées par `-->` (ou par `> NOTE_AUTEUR:`) sont des consignes d'écriture, jamais à recopier.
- Remplace tous les `{{ … }}` par du contenu concret ou supprime la ligne.
-->

# Revue technique — {{ module ou périmètre }}

**Contexte** : {{ 1 phrase — quoi a été examiné, dans quelle version Odoo, pour quel client }}
**Verdict global** : {{ ✅ Prêt pour prod / ⚠ Corrections requises / ❌ À reprendre }}

## Bloquants

- [ ] **{{ titre court }}** — `{{ fichier:ligne }}` — {{ 1-2 phrases sur l'impact réel }}
  ```python
  # Correction proposée (UNIQUEMENT si un patch concret existe)
  {{ extrait corrigé }}
  ```

## Risques importants

- **{{ titre }}** — `{{ fichier:ligne ou XML id }}` — {{ pourquoi c'est risqué + scénario qui casse }}

## Suggestions

- {{ suggestion concrète et actionable }}

## Recommandation finale

{{ 2-3 phrases : ce qu'on fait maintenant, qui décide, prochaine étape }}

# Revue technique — {{ module ou périmètre }}

**Contexte** : {{ 1 phrase — quoi a été examiné, dans quelle version Odoo, pour quel client }}
**Verdict global** : {{ ✅ Prêt pour prod / ⚠ Corrections requises / ❌ À reprendre }}

## Bloquants

> Ce qui empêche la mise en prod. Vide si rien.

- [ ] **{{ titre court }}** — {{ fichier:ligne }} — {{ 1-2 phrases sur l'impact réel }}
  Correction proposée :
  ```python
  {{ extrait corrigé }}
  ```

## Risques importants

> Pas bloquants mais à traiter dans les 2 semaines.

- **{{ titre }}** — {{ fichier:ligne ou XML id }} — {{ pourquoi c'est risqué + scénario qui casse }}

## Suggestions

> Améliorations qualitatives, à arbitrer.

- {{ suggestion concrète, jamais "il faudrait peut-être" }}

## Exemples corrigés

```python
# Avant — {{ fichier:ligne }}
{{ extrait fautif }}

# Après
{{ extrait corrigé }}
```

## Recommandation finale

{{ 2-3 phrases : ce qu'on fait maintenant, qui décide, prochaine étape }}

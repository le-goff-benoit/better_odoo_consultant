# Plan de migration — Odoo {{ source }} → {{ cible }}

**Périmètre** : {{ modules concernés, nombre d'utilisateurs, volume de données }}
**Durée estimée** : {{ X jours-homme, fourchette }}
**Risque global** : {{ Faible / Moyen / Élevé }} — {{ 1 phrase de justification }}

## Modules touchés

| Module | Type | Effort | Bloquant ? |
|---|---|---|---|
| {{ name }} | {{ custom / odoo / OCA }} | {{ X j }} | {{ oui/non }} |

## Breaking changes à traiter

- **{{ module ou API }}** — {{ ce qui change entre source et cible }} → {{ action concrète }}

## Scripts de migration nécessaires

```python
# {{ description courte }}
{{ extrait SQL ou pre-migrate.py }}
```

## Plan de test

1. **{{ scénario fonctionnel }}** — {{ qui le valide, sur quel jeu de données }}
2. {{ ... }}

## Risques & mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| {{ ex. perte de données comptables }} | Faible | Élevé | Backup + dry-run en staging |

## Calendrier proposé

- **J-{{ N }}** — Backup complet + clone staging
- **J0 (samedi soir)** — Bascule prod
- **J+1 lundi matin** — Surveillance + correctifs hot-fix

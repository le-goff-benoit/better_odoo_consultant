# Cahier des charges fonctionnel — {{ titre du besoin }}

**Demandeur** : {{ nom + rôle métier }}
**Date** : {{ AAAA-MM-JJ }}
**Version** : 1.0
**Statut** : Brouillon / À valider / Validé

## Besoin métier

{{ 2-3 phrases. Le quoi et le pourquoi, sans solution. Évite le vocabulaire Odoo. }}

## Critères d'acceptation

- [ ] {{ comportement testable, formulé en "Quand X alors Y" }}
- [ ] {{ ... }}

## Modèles Odoo impactés

| Modèle | Existant ? | Modifications |
|---|---|---|
| `sale.order` | Oui | Ajout d'un champ `x_studio_origine_lead` |
| `x_custom_xxx` | Non | Nouveau modèle Studio — voir section dédiée |

## Vues impactées

- `sale.order` form — ajout de l'onglet « Suivi commercial »
- `sale.order` list — ajout de la colonne origine

## Droits & sécurité

| Groupe | Modèle | C | R | U | D |
|---|---|---|---|---|---|
| Commercial | `x_custom_xxx` | ✓ | ✓ | ✓ |   |
| Manager Sales | `x_custom_xxx` | ✓ | ✓ | ✓ | ✓ |

## Workflow & automatisations

{{ Étapes, déclencheurs. Mermaid si utile. }}

## Livrables

- [ ] Module custom `{{ nom }}` ou personnalisations Studio (préciser)
- [ ] Données de démo / migration le cas échéant
- [ ] Documentation utilisateur dans le wiki client
- [ ] Recette signée par {{ nom }}

## Hors scope

- {{ ce qu'on ne fait *pas* dans cette itération, pour éviter la dérive }}

## Hypothèses & dépendances

- {{ ce qui doit être vrai pour que ça marche — module installé, donnée présente, etc. }}

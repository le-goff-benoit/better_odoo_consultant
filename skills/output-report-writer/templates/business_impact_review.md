<!--
INSTRUCTIONS AUTEUR (ne pas reproduire dans la réponse) :
- Public cible : business analyst / application manager / sponsor métier.
- Cadrage : traduis les faits techniques (champs Studio, automatisations, vues, modules custom) en **impact métier** sur les flux utilisateurs réels (Ventes, Achats, SAV, Stock, Facturation, RH, Projets…).
- Ne liste **jamais** un inventaire technique brut (« 84 champs custom », « 53 vues modifiées ») sans le rattacher à un flux métier et à son impact pour l'utilisateur final.
- Privilégie 1-2 tableaux structurants (flux × impact, ou module × type de personnalisation) ; ils rendent la matrice beaucoup plus lisible qu'une longue liste.
- Si une section n'a pas de contenu réel, supprime-la — pas de « Aucun » ou de « Néant ».
- Pas de code Python, pas de fichier:ligne — c'est pour le profil developer/architect.
- Remplace tous les `{{ … }}` par du contenu concret ou supprime la ligne.
-->

# Impact métier — {{ périmètre ou question }}

**Contexte** : {{ 1 phrase — version Odoo, client, ce qui a été examiné }}
**Verdict métier** : {{ ✅ Standard / ⚠ Personnalisé, attention aux flux ci-dessous / ❌ Très éloigné du standard }}

## Flux métier impactés

| Flux | Modules concernés | Type de personnalisation | Impact utilisateur |
|------|-------------------|--------------------------|---------------------|
| {{ Ventes / Abonnements }} | {{ `sale.order`, `sale.order.line` }} | {{ Champs Studio, automatisations }} | {{ Effet visible côté commercial / client }} |
| … | … | … | … |

## Détail par flux

### {{ Flux 1 — ex. Ventes / Abonnements }}

- **Ce qui change pour l'utilisateur** : {{ phrase business, pas technique }}
- **Modules touchés** : {{ liste des modèles }}
- **Automatisations actives** : {{ noms fonctionnels des automations, leur déclencheur, leur effet métier }}
- **Champs custom clés** : {{ champs qui modifient le comportement perçu — donner leur sens métier }}
- **Points à valider** : {{ qui en est propriétaire métier, à confirmer en atelier }}

### {{ Flux 2 }}

(même structure)

## Risques métier

- **{{ Risque }}** : {{ scénario concret côté utilisateur ou client, et conséquence business }}

## Points à clarifier

- {{ Question ouverte à poser en atelier ou au sponsor métier }}

## Exemples concrets sur cette base

<!--
Cette section est obligatoire quand on parle d'une fonctionnalité ou d'une
personnalisation active sur l'instance connectée. Le frontend la rend en
carte tintée (callout « ampoule ») pour la rendre immédiatement repérable
côté consultant.

Règles de remplissage :
- Lance d'abord `odoo_query_records` (limit ≤ 3) pour ramener 1-3
  enregistrements RÉELS qui illustrent le point. Pas d'invention.
- Encadre chaque référence d'enregistrement en lien Markdown avec le
  schéma custom `[label](odoo://<model>/<id>)`. Le frontend résoudra
  l'URL et rendra un lien cliquable qui ouvre directement la fiche dans
  Odoo (icône ↗ ajoutée automatiquement).
- Format conseillé : « **{{ flux }}** : sur [{{ label métier }}](odoo://{{ model }}/{{ id }}), {{ ce qui rend l'exemple parlant }} »
- Si la query ne retourne rien, écrire « *aucun enregistrement trouvé sur
  cette base — vérifier si le flux est réellement utilisé* » plutôt que
  d'inventer.
-->

- **{{ Flux 1 }}** : sur [{{ libellé client }}](odoo://{{ model }}/{{ id }}), {{ ce qui rend l'exemple parlant en 1 phrase }}.
- **{{ Flux 2 }}** : sur [{{ libellé client }}](odoo://{{ model }}/{{ id }}), {{ … }}.

## Prochaines actions (BA / AM)

1. {{ Action priorisée — propriétaire métier, livrable attendu }}
2. {{ … }}
3. {{ … }}

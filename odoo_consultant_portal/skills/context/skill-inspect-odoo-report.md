## Principes communs
- Skill en lecture seule : il inspecte les rapports PDF/QWeb réels.
- Les xpath de rapport doivent cibler l'arch réelle, pas un souvenir de template.

## inspect_odoo_report
Utilise `inspect_odoo_report` pour lire action de rapport, template QWeb, héritage, `qweb_archs`, format papier et layout société.

## Quand l'utiliser
- Facture PDF, devis PDF, bon de livraison, layout, logo, mentions légales.
- Le Creator doit produire un `modify_report`.
- Tu dois expliquer pourquoi un rapport a une apparence donnée.

## Bonnes pratiques
- Obligatoire avant tout `modify_report`.
- Pour contenu document, hérite du template document.
- Pour en-tête/pied de page, hérite du layout actif de la société.
- En QWeb rapport, utilise `t-field` ou `t-out`, pas `<field name="..."/>`.

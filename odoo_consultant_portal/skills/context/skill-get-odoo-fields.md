## Principes communs
- Skill en lecture seule : utilise-le pour éviter d'inventer un champ.
- Le résultat décrit l'instance réelle, y compris les champs Studio et modules custom.

## get_odoo_fields
Utilise `get_odoo_fields` pour inspecter les champs d'un modèle Odoo.

## Quand l'utiliser
- Tu ne connais pas le nom exact d'un champ, d'une relation ou d'un champ `x_*`.
- Une requête échoue avec "Invalid field".
- Le Creator doit créer une vue, un rapport ou une modification liée à des champs existants.

## Bonnes pratiques
- Sans `field_names`, lis l'index condensé pour repérer relations et champs custom.
- Avec `field_names`, confirme le détail complet de quelques champs candidats.
- Vérifie les relations many2one/one2many/many2many avant de composer un domain traversant.
- En cas de doute de version, croise avec `search_odoo_source`.

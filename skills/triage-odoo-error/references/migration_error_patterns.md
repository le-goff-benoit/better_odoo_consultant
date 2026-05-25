# Patterns d'erreur en contexte migration Odoo

Triage spécifique quand la base est en cours de migration ou immédiatement post-migration.

## Erreurs de schéma (post-`-i` / `-u`)

### `Field 'X' does not exist on model Y`

- **Cause** : un champ a été renommé, supprimé ou déplacé dans la version cible. Du code custom le référence encore.
- **Fix typique** : adapter le code custom — `_inherit`/`_inherits` + nom du champ — ou rajouter un script d'upgrade qui crée le nouveau nom et migre les valeurs.
- **Skill suivant** : `compare_odoo_versions` pour confirmer le renommage, puis `repo_search_code` pour localiser les usages dans le code custom.

### `column "X" does not exist`

- **Cause** : la table existe, mais une colonne attendue par le code est absente — typiquement un `_init_column` qui n'a pas tourné, ou un script post-init qui a échoué.
- **Fix typique** : relancer le module avec `-u <module>` pour forcer l'init des colonnes. Si ça ne marche pas, vérifier que le `__manifest__.py` cible la bonne version et que la dépendance qui ajoute la colonne est bien déclarée.

### `relation "X" does not exist`

- **Cause** : module non installé, ou installation interrompue, ou dépendance manquante dans le manifest.
- **Fix typique** : `odoo-bin -i <module>` après avoir vérifié les dépendances. Toujours vérifier `ir.module.module.state`.

## Erreurs de données XML / vues

### `ParseError` sur une vue legacy

- **Cause** : la vue référence un champ ou une expression Python supprimée (ex : `attrs` dans Odoo 17+, qui passent à `invisible="..."`/`readonly="..."` directs).
- **Fix typique** : migrer la vue à la nouvelle syntaxe — souvent automatisable via les scripts d'upgrade officiels.
- **Skill suivant** : `migration_read_target_file` sur la vue cible standard pour voir la nouvelle forme attendue.

### `External ID not found in the system`

- **Cause** : un record XML référence un `module.xml_id` qui n'a pas encore été installé / a été renommé.
- **Fix typique** : vérifier l'ordre de chargement des modules (manifest `depends`) et l'existence du record dans `ir.model.data`.

## Erreurs OpenUpgrade / scripts d'upgrade

### Frame dans `migrations/<version>/<phase>.py`

- **Cause** : un script d'upgrade plante. `phase` est `pre`/`post`/`end`.
- **Triage** : lire le script en question (`source_read_odoo_file` si fait partie d'OpenUpgrade officiel, sinon `repo_read_file`). Souvent c'est une assertion sur une donnée pré-existante qui n'est pas conforme.

### `UpgradeError` / `UpgradeRequiredError`

- **Cause** : un module détecte qu'il doit migrer des données mais l'opération échoue. Le message d'exception cite généralement la ligne ou l'enregistrement coupable.

## Erreurs Studio en migration

Studio est **particulièrement fragile** en migration parce que les `x_studio_*` ne sont pas couverts par les scripts d'upgrade officiels.

- Symptôme typique : `Field 'x_studio_…' does not exist on model …` après migration.
- Triage : `inspect_studio` pour lister les customisations Studio actuelles, puis comparer avec la base source pour identifier ce qui n'a pas été repris.

## Règles d'orientation

- Si l'erreur **disparaît** sur une base à la même version sans migration → bug introduit par la migration.
- Si l'erreur **existe aussi** sur la base source pré-migration → ce n'est PAS un bug migration, c'est un bug latent qui se révèle.
- Toujours documenter la **version source** et la **version cible** dans la réponse — sans ces deux infos, le diagnostic est aveugle.

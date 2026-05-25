# Arbre de décision — triage erreur Odoo

L'ordre des questions est délibéré : on **élimine** les causes les plus fréquentes avant de blâmer le code.

## 1. La base est-elle en cours / juste après migration ?

- Oui → vérifier d'abord les signaux **migration** :
  - `Field 'X' does not exist on model Y` → champ renommé/supprimé entre versions
  - `column "X" does not exist` → migration de schéma incomplète (script post-init manqué)
  - `ir.model.data: External ID not found` → record XML qui référence un module non encore migré
  - `ParseError` dans une vue legacy → vue non rendue compatible avec la nouvelle version
  - Stack frames dans `migrations/<version>/` ou `openupgradelib` → script d'upgrade en faute
  - Verdict : **migration** — confidence haute si ≥2 signaux, sinon medium.

## 2. Studio est-il utilisé sur cette base ?

- Si le frame innermost passe par `/web_studio/` ou si la trace contient `x_studio_*` ou `studio_customization` :
  - Verdict : **studio** — le bug vient d'une customisation UI.
  - **Ne pas** chercher de fix code : utiliser `inspect_studio` pour identifier la customisation puis corriger via l'interface Studio (ou désactiver / supprimer la customisation fautive).

## 3. L'exception est-elle de classe « data » ?

Une classe d'exception « data » signifie par définition que le problème vient d'un enregistrement non conforme :

| Classe d'exception | Signification |
|---|---|
| `ValidationError` (`@api.constrains`) | Une contrainte métier est violée |
| `UserError` | Une règle métier explicite refuse l'opération |
| `MissingError` | L'enregistrement référencé n'existe plus / pas accessible |
| `AccessError` | Droits insuffisants pour cet utilisateur sur ce record |
| `psycopg2.IntegrityError` | Contrainte SQL violée (NOT NULL, UNIQUE, FK, CHECK) |
| `psycopg2.errors.NotNullViolation` | Champ obligatoire vide |
| `psycopg2.errors.ForeignKeyViolation` | Référence à un record supprimé |
| `psycopg2.errors.UniqueViolation` | Doublon sur un champ unique |
| `psycopg2.errors.CheckViolation` | Contrainte CHECK PostgreSQL non satisfaite |

Verdict : **data**. Même si le frame innermost est dans Odoo standard, le problème reste la donnée.

## 4. Frame innermost dans un chemin custom ?

Si le frame **innermost** (le plus profond, en bas du traceback) est dans :
- un module sous `~/.odoo-consultant/repos/<profile>/`
- un module dont le nom n'apparaît pas dans les addons Community ou Enterprise standard
- `OCA` non identifié comme tel
→ Verdict : **custom_dev**.

Méthode : `repo_search_code` pour trouver la définition, `repo_read_file` pour lire le fichier en question. Souvent un `_inherit` mal écrit, un `compute` non `@depends`, un override qui ignore le `super()`.

## 5. Sinon, frame innermost dans Odoo standard

Si la trace est purement dans `/odoo/addons/` ou `/enterprise/` et qu'aucun signal data/Studio/migration n'a déclenché :

- Verdict : **source_code** — mais avec prudence.
- 95 % des « bugs Odoo » sont en réalité d'une des 4 catégories précédentes mal diagnostiquée.
- Avant de conclure « bug Odoo », vérifier :
  1. La version mineure exacte (le commit récent peut avoir introduit ou corrigé le bug).
  2. Si un module custom hérite/surcharge la méthode en cause (`source_search_odoo` puis `repo_search_code`).
  3. Si la situation est reproductible avec une base démo Odoo vierge à la même version.

Si tout est confirmé → ouvrir une issue / PR vers Odoo. `source_show_commit` aide à vérifier l'historique récent du fichier en cause.

## 6. Cas dégradé : trace incomplète

Si moins de 3 frames sont extraites, ou si l'utilisateur n'a collé que le message d'erreur sans traceback :

- **Demander** la trace complète (`Logger PostgreSQL` ou `--log-level=debug` côté serveur) plutôt que de deviner.
- Demander aussi la version Odoo source et cible si migration est suspectée.

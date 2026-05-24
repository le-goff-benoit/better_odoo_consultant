# Conventions de commit Odoo

Référence chargée à la demande quand le prompt évoque un commit Odoo, un changelog, un tag de commit, ou pour interpréter le sens d'un `[XXX]` en tête de message.

## Format général

```
[TAG] module: message en anglais
```

- **TAG** : 3-5 lettres majuscules entre crochets.
- **module** : nom technique du module modifié (ex. `sale`, `account`, `mrp`).
- **message** : courte description en anglais, à l'impératif présent, sans point final.

Exemples réels :
```
[IMP] sale: precise tax computation when amount_total is fixed
[FIX] account: correct rounding on tax detail report
[REM] crm_phone: remove deprecated method action_call
[ADD] sale: add new section "Optional Products" in form view
```

## Catalogue complet des tags

| Tag | Sens | Quand l'utiliser | Importance migration |
|---|---|---|---|
| `[FIX]` | Bug fix | Correction d'un bug existant | Faible (correctif rétroactif) |
| `[IMP]` | Improvement | Amélioration fonctionnelle d'existant | Moyenne |
| `[ADD]` | New feature | Ajout d'une feature ou d'un module entier | Forte (peut être backward compat) |
| `[REM]` | Removal | Suppression de code/feature | **Très forte** — breaking |
| `[REF]` | Refactor | Réorganisation interne sans changement fonctionnel | Moyenne (peut casser des overrides) |
| `[MOV]` | Move | Déplacement de code entre fichiers/modules | Forte si tu importais le chemin |
| `[REV]` | Revert | Annule un commit précédent | Variable |
| `[CLA]` | Clean | Nettoyage code mort, formatting | Faible |
| `[I18N]` | Internationalization | Traductions, formats locaux | Faible |
| `[MERGE]` | Merge | Merge commit (rare en convention squash) | Aucune |
| `[PERF]` | Performance | Optimisation perf | Faible |
| `[TYP]` | Typo | Faute de frappe (code, doc, strings) | Faible |
| `[FW]` | Forward-port | Backport d'un fix d'une version vers une autre | Faible |
| `[DOC]` | Documentation | Doc utilisateur ou inline | Aucune |

## Tags étendus (Enterprise / Odoo SH / partners)

| Tag | Sens |
|---|---|
| `[ENT]` | Spécifique Enterprise |
| `[BLINK]` | Spécifique Odoo.sh (rare) |
| `[CUSTOM]` | Client custom (usage interne partner) |

## Implications pour la migration

Quand tu auditerais un changelog entre versions Odoo, voici l'importance par tag :

### Tags à examiner attentivement (potentiellement breaking)

- **`[REM]`** : méthode/champ/module supprimé. Si ton code custom l'utilisait, refactor nécessaire.
- **`[MOV]`** : un fichier ou une classe a changé d'emplacement. Les imports cassent.
- **`[REF]`** : signature de méthode peut changer. Les overrides peuvent casser silencieusement (méthode renommée ou paramètres réordonnés).

### Tags informatifs

- **`[IMP]` + `[ADD]`** : tu **peux** profiter de la nouvelle feature mais pas obligé. Souvent backward compatible.
- **`[FIX]`** : tu **dois** récupérer le fix (sécurité, data integrity). Vérifier que ton override n'annule pas le fix.

## Anti-patterns observés

### Tag manquant

```
sale: fix amount_total
```

Devrait être `[FIX]` si correction, `[IMP]` si amélioration. À reclasser à la lecture.

### Module manquant

```
[FIX] correct invoice amount
```

Pas de module → fichier touché probablement dans `odoo/` ou plusieurs modules. Plus rare.

### Plusieurs modules

```
[FIX] sale,account: fix tax on invoice creation from SO
```

Convention : modules listés séparés par virgule, sans espace.

### Message en français ou avec ponctuation forte

```
[FIX] sale: Correction du calcul des taxes.
```

Devrait être : `[FIX] sale: correct tax computation` (anglais, impératif, pas de point).

## Extraction automatique vers un changelog

Pour produire un changelog client à partir d'une plage de commits :

1. `git log v17.0...v17.1 --oneline` → liste brute.
2. Grouper par tag :
   - `[FIX]` → section **Bug Fixes**
   - `[ADD]` → section **New Features**
   - `[REM]` → section **Breaking Changes** (avec ⚠)
   - `[IMP]` + `[REF]` → section **Improvements**
   - `[CLA]`, `[TYP]`, `[DOC]`, `[I18N]` → souvent omis du changelog client (trop bas niveau)
3. Pour chaque entrée, traduire le module et reformuler en français côté client.

Le skill `report_writer` a un template `changelog_entry.md` pour formaliser ça.

## Cas du fork / partner

Les commits dans les modules Odoo Community Association (OCA) suivent la même convention. Idem pour la plupart des modules partners (Camptocamp, Akretion, Odoo Belgium).

Les modules Odoo SH ou client custom n'ont **pas** d'obligation conventionnelle. Si tu auditerais un repo client, c'est souvent du « best effort » avec messages libres — moins informatifs.

## Outils complémentaires

- `git_show_commit scope=odoo|enterprise|target|project` : voir le diff d'un commit donné.
- `search_odoo_source` : retrouver le code source touché par un commit.
- `report_writer` (template `changelog_entry.md`) : formater un commit en entrée de changelog.

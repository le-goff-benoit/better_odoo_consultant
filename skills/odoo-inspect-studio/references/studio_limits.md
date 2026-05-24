# Limites Odoo Studio — piège-mémoire

> Cette référence n'est *pas* chargée en permanence. Le LLM doit l'appeler via `load_skill_reference("odoo_inspect_studio", "studio_limits.md")` quand l'utilisateur évoque un blocage, une migration Studio, ou un comportement Studio surprenant.

## Vues non éditables avec Studio

| Vue | Pourquoi |
|---|---|
| `calendar` | Studio n'expose pas l'éditeur graphique — passage en code custom obligatoire |
| `gantt` | idem |
| `cohort` | idem |
| `dashboard` (graphique custom complexe) | partiellement — limité aux KPI simples |
| `qweb` (rapport PDF) | Studio édite le layout mais pas la logique QWeb |

## Modèles intouchables

- `res.users`, `res.company`, `res.partner` : ajout de champs OK, suppression/modification structurelle **non**.
- Modèles abstraits (`AbstractModel`) : invisibles dans Studio.
- Modèles `_transient = True` (wizards) : invisibles dans Studio.

## Champs Studio (`x_studio_*`) — règles

- Préfixe `x_studio_` automatique — ne pas chercher à le renommer dans le code custom.
- Stockés via `ir.model.fields` avec `state='manual'` — détectables via XML-RPC.
- Pas de `compute` arbitraire : Studio expose 4 patterns (somme, max, copie d'un champ relié, formule).
- Pas de `related` à plus d'un niveau de profondeur via l'UI.

## Automatisations Studio

- `base.automation` = règles "Quand X alors Y".
- Limite : pas de boucle, pas de batch update — pour ça il faut un cron + serveur action.
- Server actions Python autorisées mais sandboxées (pas d'import arbitraire).

## Migration Studio entre versions

- Les vues Studio sont stockées comme `ir.ui.view` avec `mode='extension'` + xpath — migrent généralement bien.
- Les champs `x_studio_*` migrent **si** la version cible supporte le type (ex. `properties` champ JSON apparu en 17 — ne migre pas vers 16).
- Les automatisations migrent rarement proprement : à recréer manuellement après bump.

## Signaux d'alerte côté audit

- Plus de 20 modèles avec persos Studio → projet probablement "Studio-dev mixte", risque de duplication avec code custom.
- Champs `x_studio_*` référencés dans du code Python custom → couplage fragile, à refactorer.
- Champs Studio sans `string` (label) → erreur de conception, à corriger.

## Sources officielles

- Documentation Studio Odoo : https://www.odoo.com/documentation/{version}/applications/studio.html
- Code Studio (Enterprise) : `odoo/enterprise/web_studio/`

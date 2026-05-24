# Usage canonique — repo_list_modules

**Prompt utilisateur** : « Liste les modules custom du projet avec leurs dépendances. »

**Tool call attendu** :
```json
{
  "name": "repo_list_modules",
  "arguments": {
    "include_invalid": true,
    "limit": 300
  }
}
```

**Pourquoi ces arguments** :
- Pas de `path` : on parse tout le repo. Si le client a une convention (`modules-custom/` ou `local-src/`), restreindre via `path="modules-custom"`.
- `include_invalid=true` : on veut voir les manifests cassés (typos, AST invalide) plutôt que les masquer — ils sont souvent la cause de modules « qui ne s'installent pas ».
- `limit=300` : borne seulement la liste retournée. Le scan continue à compter `scanned_manifests` / `total_modules`; vérifier `truncated` avant de conclure.

**Résultat retourné** :
```json
{ "ok": true,
  "scanned_manifests": 16,
  "modules": [
    {
      "technical_name": "acme_pricing_engine",
      "path": "acme_pricing_engine",
      "name": "Acme — Pricing Engine",
      "version": "17.0.1.2.4",
      "author": "Acme Studio",
      "license": "OEEL-1",
      "depends": ["sale_management", "product"],
      "data_files": 12,
      "demo_files": 0,
      "installable": true,
      "application": false
    },
    {
      "technical_name": "acme_sales_extension",
      "version": "17.0.0.1.3",
      "depends": ["sale_management", "crm", "account", "acme_pricing_engine"],
      ...
    },
    ... (14 autres)
  ],
  "invalid_manifests": []}
```

**Interprétation côté assistant** :
> Le projet compte **16 modules custom** parsés (0 manifest invalide). Vue d'ensemble :
>
> **Modules avec dépendance interne (chaîne)** :
> - `acme_pricing_engine` (base — dépend seulement de `sale_management` + `product`)
> - `acme_sales_extension` → dépend de `acme_pricing_engine`
> - `acme_crm_pipeline` → dépend de `acme_sales_extension`
> - `acme_reporting_dashboards` → dépend de `acme_sales_extension` + `acme_crm_pipeline`
>
> **Standalone (pas de dépendance custom)** : 12 autres modules.
>
> **Versions** : essentiellement `17.0.x.y.z` — bonne discipline de versioning. Aucun module n'est en pre-release (`0.x.x.x`).
>
> **Licences** : 9 en `OEEL-1` (Enterprise — nécessitent une licence Odoo Enterprise), 7 en `LGPL-3`. Vérifier que le client est sous contrat Enterprise.
>
> **Suggestion** : la chaîne `pricing_engine` → `sales_extension` → `crm_pipeline` → `reporting_dashboards` est intéressante à représenter en graphe d'install pour aider les nouveaux dev. Je peux générer une vue Mermaid si tu veux.

**Pièges à éviter** :
- Un manifest « invalide » a typiquement : (a) une virgule manquante dans le dict, (b) un import en tête de fichier qui plante (le manifest doit rester un dict pur — pas de code), (c) un commentaire bloc Python entre `{` et `}`.
- Le `name` (label humain) ≠ `technical_name` (= nom de dossier). Le `technical_name` est ce qu'on utilise dans `depends`.
- `installable: false` ne signifie pas « cassé » mais « pas listé dans Apps » — souvent intentionnel pour des modules-techniques internes ou parents abstraits.
- Le module retourne ses dépendances **déclarées**, pas les dépendances transitives. Pour l'arbre complet, croiser avec `odoo_inspect_modules` côté instance.

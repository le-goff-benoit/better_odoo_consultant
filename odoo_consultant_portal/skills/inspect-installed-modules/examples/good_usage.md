# Usage canonique — inspect_installed_modules

**Prompt utilisateur** : « Quels modules custom sont installés sur ce projet ? »

**Tool call attendu** :
```json
{
  "name": "inspect_installed_modules",
  "arguments": { "filter": "" }
}
```

**Pourquoi ces arguments** :
- Pas de `apps_only` : on veut aussi les modules techniques (sécurité, helpers) qui peuvent être custom.
- Pas de `filter` : on récupère tout puis on s'appuie sur `likely_custom` pour distinguer. Les heuristiques du tool flaguent automatiquement les modules dont l'author contient « custom », « odoo sh », « studio », « client » ou dont le nom commence par `x_`.
- `limit=300` (défaut) suffit pour un projet typique. Le résumé en tête indique si on dépasse.

**Résultat retourné** :
```json
{ "ok": true, "count": 187, "applications_count": 24, "likely_custom_count": 11,
  "modules": [
    { "name": "sale_management", "shortdesc": "Sales", "author": "Odoo S.A.",
      "installed_version": "17.0.1.0.0", "application": true, "likely_custom": false },
    { "name": "acme_pricing_engine", "shortdesc": "Acme — pricing custom",
      "author": "Acme Studio", "installed_version": "17.0.0.1.3",
      "application": false, "likely_custom": true },
    ...
  ]}
```

**Interprétation côté assistant** :
> Le projet a **187 modules installés** dont **24 applications** et **11 modules custom** détectés :
>
> | Module | Auteur | Version |
> |---|---|---|
> | `acme_pricing_engine` | Acme Studio | 17.0.0.1.3 |
> | `acme_crm_pipeline_extension` | Acme Studio | 17.0.0.0.2 |
> | ... (9 autres) |
>
> Les modules `acme_*` ressemblent à des développements client. Pour un audit du code, je peux les ouvrir un par un avec `read_project_file` ou en faire l'inventaire des manifests via `list_project_modules`.

**Pièges à éviter** :
- `likely_custom` est une **heuristique** (regex sur l'auteur, nom préfixé `x_`). Un module dev par un partenaire connu (« Camptocamp », « Akretion ») n'est PAS flaggé custom mais l'est souvent pour le client.
- `state="installed"` exclut les modules `to_install`, `to_upgrade`, `uninstalled`. Si le user enquête sur un module qui « semble pas marcher », vérifier aussi ces états.
- Comparer la `installed_version` à la version Odoo de l'instance — un module en `15.0.x.y.z` sur une instance 17 = bombe à retardement.

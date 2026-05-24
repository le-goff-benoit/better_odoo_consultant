# Usage canonique — repo_count_source_lines

**Prompt utilisateur** : « Quelle volumétrie de code custom a-t-on sur ce projet client ? »

**Tool call attendu** :
```json
{
  "name": "repo_count_source_lines",
  "arguments": {
    "scope": "project",
    "file_types": ["*.py", "*.xml", "*.js", "*.scss"],
    "group_by": "module"
  }
}
```

**Pourquoi ces arguments** :
- `scope="project"` : on compte sur le repo client. Alternatives :
  - `odoo` : sources Odoo Community/Enterprise courantes
  - `target` : sources de la version cible (migration)
- `file_types` : Python (code), XML (vues + données), JS et SCSS (frontend). On exclut les `*.po` (traductions, volumineux mais peu structurants) et les `*.md` (doc).
- `group_by="module"` : on veut un breakdown par module custom — la métrique métier qui parle au consultant.

**Résultat retourné** :
```json
{ "ok": true,
  "scope_path": "/home/.../acme-prod",
  "total_files": 487,
  "total_lines": 28453,
  "by_group": {
    "acme_pricing_engine": { "files": 64, "lines": 8742 },
    "acme_sales_extension": { "files": 52, "lines": 5910 },
    "acme_crm_pipeline": { "files": 38, "lines": 4220 },
    "acme_reporting_dashboards": { "files": 41, "lines": 3845 },
    "acme_partner_kyc": { "files": 28, "lines": 2104 },
    ... (11 autres modules)
  }}
```

**Interprétation côté assistant** :
> Volumétrie code custom du projet : **28 453 lignes** sur **487 fichiers** dans **16 modules**.
>
> Top 5 modules par taille :
> | Module | Fichiers | Lignes |
> |---|---|---|
> | `acme_pricing_engine` | 64 | 8 742 |
> | `acme_sales_extension` | 52 | 5 910 |
> | `acme_crm_pipeline` | 38 | 4 220 |
> | `acme_reporting_dashboards` | 41 | 3 845 |
> | `acme_partner_kyc` | 28 | 2 104 |
>
> Ordre de grandeur : **projet de taille moyenne** (entre 10k et 50k LOC). Effort de maintenance estimable à 0.5-1 ETP. La concentration sur `acme_pricing_engine` (30% du total) suggère que ce module porte le différenciateur métier — investir prioritairement sur sa qualité (tests, doc, refactor).

**Pièges à éviter** :
- Le compteur exclut automatiquement `.git`, `node_modules`, `__pycache__`, `.venv`, `dist`, `build`. Pour un repo qui en aurait d'autres (bundles compilés, vendoring), réduire via `path="src"` au lieu de tout le repo.
- `group_by="extension"` est utile pour comparer Python vs XML vs JS (équilibre frontend/backend). `group_by="directory"` pour les gros monorepos avec sous-dossiers métier.
- Le LOC brut compte les lignes vides et commentaires. Pour un LOC « significant » (cloc-like), ce n'est pas l'outil — préférer cloc côté CLI standalone si besoin de précision.
- Hard cap à 50 000 fichiers : sur un repo monstre, restreindre via `path=` ou `file_types=`.

# Plan — 2 nouveaux skills IA (financial-reports, spreadsheet)

## Contexte

L'app `better_odoo_consultant` (v0.94.0) couvre les rapports QWeb/PDF via `odoo_inspect_report` mais **pas** les rapports financiers Enterprise (`account.report` : compte de résultat, bilan, grand livre, tax report) ni les **Odoo Spreadsheets** (`documents.document` + `spreadsheet.dashboard` avec formules `ODOO.PIVOT` / `ODOO.LIST` / `ODOO.FILTER.VALUE`).

Or ce sont deux zones très consultantes :

- **Financial reports** — usages attendus :
  1. *Conseiller un rapport adapté à une demande* (« quel rapport pour la situation TVA T2 ? »).
  2. *Décrire la structure* d'un rapport (lignes, colonnes, filtres, variantes).
  3. **Exécuter le rapport pour un périmètre donné** (client = partner, projet = analytic_account, période, société) et retourner les chiffres.
  4. *Exporter* (XLSX/PDF) avec les mêmes filtres.
  5. *Commenter / proposer des modifications* (futur — read-only à ce stade).
- **Spreadsheets** — usages attendus :
  1. Lister les spreadsheets et dashboards disponibles dans une instance.
  2. Lire le contenu JSON et inventorier les formules (en particulier les formules `ODOO.*`).
  3. Expliquer une formule, valider sa syntaxe, suggérer une formule alternative pour un besoin donné, en s'appuyant sur la liste des formules exposées par les sources Enterprise locales.

Objectif : passer de 32/32 à 34/34 skills, eval queries complètes, pruning anti-fuites.

---

## Skill 1 — `inspect-financial-reports`

### Périmètre

Un skill unifié à **5 modes** (argument `action`) ; permissions `odoo: read`, `filesystem: read`, `read_only: true` (l'export reste une lecture côté Odoo : `_get_lines` + génération XLSX serveur via méthode standard, mais pas d'écriture).

| `action` | Description | Données retournées |
|---|---|---|
| `list` | Liste les rapports `account.report` disponibles, regroupés par `country_id` et `root_report_id`. | `[{id, name, country, variants, filters_enabled}]` |
| `recommend` | À partir d'une description libre (`query` arg), score les rapports candidats par intersection de mots-clés (nom + traductions FR/EN + `account_type`) et retourne le top 3 avec justification. | `[{report, score, why}]` |
| `describe` | Décrit un rapport : lignes, colonnes, filtres activables, variantes, sections. | `{lines, columns, filters, variants, sections}` |
| `run` | **Exécute le rapport** avec options (`date_from`, `date_to`, `partner_ids`, `analytic_account_ids`, `company_ids`, `journal_ids`, `unfold_all`). Appelle la méthode `_get_lines` via XML-RPC. | `{lines: [{name, columns, level, unfoldable, ...}], totals, options_used}` |
| `export` | Identique à `run` mais déclenche `export_to_xlsx`. Retourne un base64 borné (max 5 MB) + nom de fichier ; au-delà, retourne un message demandant un export manuel. | `{filename, mime, content_b64, truncated}` |

### Args handler

```python
{
  "action": "list" | "recommend" | "describe" | "run" | "export",
  "report": int | str,                # id ou name technique (pour describe/run/export)
  "query": str,                       # pour recommend
  "options": {                        # pour run/export
    "date_from": "2026-01-01",
    "date_to": "2026-03-31",
    "partner_ids": [12, 34],
    "analytic_account_ids": [7],
    "company_ids": [1],
    "journal_ids": [...],
    "unfold_all": false,
    "comparison": "previous_period" | "previous_year" | null,
  }
}
```

### Implémentation backend

- **Nouveau service** : `backend/services/financial_report_service.py`, exposant :
  - `async def list_financial_reports(odoo_ctx)` → `search_read_bounded` sur `account.report` (champs `name`, `country_id`, `root_report_id`, filtres bool/selection).
  - `async def recommend_financial_report(odoo_ctx, query)` → scoring tf-idf léger côté Python sur `name` + traductions disponibles via `ir.translation` (limit raisonnable) + heuristiques sur mots-clés (`bilan` → BS, `résultat` → P&L, `TVA`/`tax` → Tax Report, `grand livre`/`GL` → General Ledger, `analytique` → variantes analytiques).
  - `async def describe_financial_report(odoo_ctx, report)` → `read` du record + `search_read` sur `account.report.line`, `account.report.column`, `account.report.expression`.
  - `async def run_financial_report(odoo_ctx, report, options)` → construit le dict `options` au format attendu par Odoo (lookup des filtres dispos via `describe` en cache local mémoire de session), puis appelle `account.report._get_lines(options)` via `call_kw` XML-RPC. Tronque les lignes au-delà de `max_lines=500` avec `truncated: true`.
  - `async def export_financial_report(odoo_ctx, report, options)` → `call_kw` sur `export_to_xlsx`, récupère le `content`, vérifie taille, encode base64.
- **Handler** : `skills/inspect-financial-reports/scripts/handler.py`, mince :
  ```python
  REQUIRES_ODOO = True
  async def run(args, ctx):
      from backend.services.financial_report_service import dispatch_financial_report_action
      return await dispatch_financial_report_action(ctx.odoo, args)
  ```

### Cas client / projet (cf. message utilisateur)

- **Client** → `options.partner_ids = [client_id]`. Précondition : si l'utilisateur dit « pour le client X », le LLM résout d'abord `partner_id` via `query_odoo` (`res.partner` `name ilike X`) puis appelle `inspect_financial_reports` avec `action=run`.
- **Projet** → `options.analytic_account_ids = [aa_id]`. Résolution analogue via `account.analytic.account` ou `project.project.analytic_account_id`.
- **Période** → `date_from`/`date_to` parsés depuis verbatim (T1, mars 2026, etc.). Documenté dans `references/run_options.md`.

### Frontmatter clés

```yaml
keywords: [bilan, balance sheet, compte de résultat, P&L, profit and loss, grand livre,
           general ledger, tax report, déclaration TVA, état financier, financial report,
           account.report, rapport comptable, exporter rapport, situation client,
           résultat projet, analytique, partenaire]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
references_auto_load:
  - file: account_report_taxonomy.md
    triggers: [bilan, compte de résultat, tax, grand livre, GL, BS, P&L, financial report]
  - file: run_options.md
    triggers: [date_from, date_to, partner, analytic, période, exporter]
```

### References

- `references/account_report_taxonomy.md` — taxonomie des `account.report` standard (BS, P&L, GL, Aged receivable/payable, Tax, Cash Flow), variantes par pays, mode `use_sections`.
- `references/run_options.md` — format complet `options` attendu par `_get_lines`, comment résoudre partenaire/analytique/société/période depuis le langage naturel.

### Templates

- `templates/financial_report_summary.md` — format de réponse standard quand `action=run` : intro 2 lignes (rapport / périmètre), tableau Markdown des lignes principales, totaux, footnote sur les filtres appliqués.

### Eval queries (10-12 cas)

- Positifs : « bilan du client Acme au 31/03 », « P&L du projet PRJ-42 sur 2026 », « grand livre janvier février 2026 », « quel rapport pour voir la situation TVA T1 » (→ `recommend`), « exporte le compte de résultat 2025 en Excel ».
- Négatifs : « liste les factures d'Acme » (→ `query_odoo`), « inspecte le rapport QWeb sale.report_invoice » (→ `odoo_inspect_report`).
- Near-miss : « rapport des ventes par commercial » (→ `read_group_odoo`, pas un `account.report`).

---

## Skill 2 — `inspect-spreadsheet`

### Périmètre

Un skill unifié à **4 modes** (`action`) ; permissions `odoo: read`, `filesystem: read`, `read_only: true`.

| `action` | Description | Données retournées |
|---|---|---|
| `list` | Liste spreadsheets (`documents.document` `handler='spreadsheet'`) et dashboards (`spreadsheet.dashboard`). | `[{id, name, kind, folder, owner}]` |
| `inspect` | Lit un spreadsheet : décode `attachment_id.raw` (JSON ou XLSX zippé), liste les sheets, cellules non-vides, **inventaire des formules `ODOO.*`** avec leur cellule. | `{sheets: [{name, cells, formulas}], formula_summary}` |
| `explain_formula` | Explique une formule donnée (`formula` arg) en s'appuyant sur la doc des formules `ODOO.*` chargée depuis sources Enterprise. | `{formula, signature, params, example, notes}` |
| `suggest_formula` | À partir d'un besoin libre (`query` arg) et optionnellement d'un modèle Odoo, suggère 1-3 formules `ODOO.*` candidates avec un squelette. | `[{formula, why, sample}]` |

### Args handler

```python
{
  "action": "list" | "inspect" | "explain_formula" | "suggest_formula",
  "document_id": int,                 # pour inspect
  "model": "documents.document" | "spreadsheet.dashboard",
  "formula": str,                     # pour explain_formula
  "query": str,                       # pour suggest_formula
  "model_hint": str,                  # modèle Odoo visé (suggest_formula)
}
```

### Implémentation backend

- **Nouveau service** : `backend/services/spreadsheet_service.py` :
  - `async def list_spreadsheets(odoo_ctx)` → `search_read` sur `documents.document` (`handler='spreadsheet'`) + `spreadsheet.dashboard`.
  - `async def inspect_spreadsheet(odoo_ctx, document_id, model)` :
    1. `read` `attachment_id` → récupère `raw` (base64 sur XML-RPC).
    2. Décode : tentative JSON direct, sinon dézippe XLSX. Helper `_parse_spreadsheet_payload(bytes)` qui retourne un dict `{sheets, version}`.
    3. Pour chaque sheet, walk les cellules, extrait `content`. Détecte formules : regex `=\s*ODOO\.[A-Z_.]+\(...\)` (multilignes possibles).
    4. Construit l'inventaire : `{formula_name → [{sheet, cell, raw}]}`.
    5. Borne : max 2000 cellules retournées, `truncated: true` au-delà.
  - **Inventaire des formules `ODOO.*` disponibles** : helper `load_odoo_spreadsheet_formula_catalog(source_path_enterprise)` qui parse les JS sources `spreadsheet/static/src/**/*.js` et `spreadsheet_edition/static/src/**/*.js` à la recherche de `category: "Odoo"` et `name: "ODOO.XYZ"`, extraction de `description`, `args`, `returns`. Cache en mémoire `{version → catalog}` (clé `source_path`). Réutilisé par `explain_formula` et `suggest_formula`.
  - `async def explain_formula(formula, source_path)` → match exact dans le catalogue, fallback fuzzy.
  - `async def suggest_formula(query, model_hint, source_path)` → heuristiques sur intent (agréger → `ODOO.PIVOT`, lister → `ODOO.LIST`, valeur filtrée → `ODOO.FILTER.VALUE`, lookup → `ODOO.LOOKUP` si présent).
- **Handler** : `skills/inspect-spreadsheet/scripts/handler.py`, mince, dispatch sur `action`.
- **`REQUIRES_ODOO = True` ; `REQUIRES_SOURCE = True`** (catalogue formules vient des sources Enterprise locales).

### Modules sources confirmés (Enterprise)

Confirmés présents en 18.0-enterprise : `spreadsheet_edition`, `documents_spreadsheet`, `spreadsheet_dashboard_edition`, 14+ variantes sectorielles `spreadsheet_dashboard_*`. Le module Community `spreadsheet` (assets JS) doit être pris depuis `~/.odoo-consultant/sources/18.0/spreadsheet/static/src/` si présent ; sinon fallback sur les JS d'`spreadsheet_edition`.

### References

- `references/odoo_spreadsheet_formulas.md` — synthèse manuelle des formules `ODOO.*` clés (PIVOT, LIST, FILTER.VALUE, LOOKUP), avec exemples. Note : la liste exhaustive vient du catalogue runtime extrait des JS sources, ce fichier est un raccourci pédagogique.
- `references/spreadsheet_payload_format.md` — format JSON interne (sheets[], cells, dataSources pour pivots/lists, globalFilters), différences XLSX-only vs JSON natif Odoo.

### Templates

- `templates/spreadsheet_inspection_report.md` — format `inspect` : intro, table sheets, top 10 formules `ODOO.*` avec localisation, recommandations.

### Eval queries (8-10 cas)

- Positifs : « explique la formule =ODOO.PIVOT(...) », « inspecte le spreadsheet Budget 2026 », « quelle formule pour récupérer le CA par client », « liste les spreadsheets dispos ».
- Négatifs : « liste les rapports QWeb » (→ `odoo_inspect_report`), « formule Excel SOMME.SI » (hors scope → réponse normale, pas ce skill).
- Near-miss : « dashboard Sales » (→ ambigu, doit déclencher `list` si `spreadsheet.dashboard` présent, sinon `query_odoo` sur autre modèle).

---

## Modifications backend transverses

1. **`backend/services/context_service.py`** (dispatcher) :
   - Ajouter bundle `financial_audit` (ciblant `inspect_financial_reports` + éventuellement `query_odoo` pour résoudre partner/analytic — mais avec pruning `pruned:financial-run-focus` qui désélectionne `query_odoo` si la query mentionne explicitement « bilan / P&L / compte de résultat / grand livre » avec un périmètre clair, pour éviter doublons).
   - Ajouter bundle `spreadsheet_audit` (ciblant `inspect_spreadsheet`).
   - Patterns dédiés (score ~ 85) : `financial-report-pattern` (regex sur « bilan », « compte de résultat », « grand livre », « tax report », « état financier ») et `spreadsheet-formula-pattern` (regex sur `ODOO\.[A-Z]+`, « spreadsheet », « tableur Odoo »).
   - Étendre `_BOUNDARY_TOKENS` avec `bilan`, `P&L` (échappé), `GL` si nécessaire.

2. **Aucune modif `registry.py`** : loader auto.

3. **Aucune dépendance Python nouvelle** : `pypdf` déjà présent (PDF financial reports si jamais), `zipfile` stdlib pour XLSX spreadsheet.

---

## Fichiers à créer / modifier

**Création** (skills + services) :
- `skills/inspect-financial-reports/SKILL.md`
- `skills/inspect-financial-reports/scripts/handler.py`
- `skills/inspect-financial-reports/diagram/diagram.yaml`
- `skills/inspect-financial-reports/eval_queries.json`
- `skills/inspect-financial-reports/references/account_report_taxonomy.md`
- `skills/inspect-financial-reports/references/run_options.md`
- `skills/inspect-financial-reports/templates/financial_report_summary.md`
- `skills/inspect-spreadsheet/SKILL.md`
- `skills/inspect-spreadsheet/scripts/handler.py`
- `skills/inspect-spreadsheet/diagram/diagram.yaml`
- `skills/inspect-spreadsheet/eval_queries.json`
- `skills/inspect-spreadsheet/references/odoo_spreadsheet_formulas.md`
- `skills/inspect-spreadsheet/references/spreadsheet_payload_format.md`
- `skills/inspect-spreadsheet/templates/spreadsheet_inspection_report.md`
- `backend/services/financial_report_service.py`
- `backend/services/spreadsheet_service.py`

**Modification** :
- `backend/services/context_service.py` (bundles + patterns + 1-2 règles `pruned:*-focus`)
- `frontend/src/version.ts` → `0.95.0`
- `frontend/src/pages/About.tsx` (entrée changelog en tête, badge `Actuel` déplacé)
- `README.md` (capacités financières + spreadsheet)
- `CLAUDE.md` (état récent + skills présents 32 → 34)

**Helpers à réutiliser (cf. exploration)** :
- `backend/services/odoo_pagination.py::search_read_bounded`
- `backend/services/odoo_client.py::OdooClient.call_kw` (pour `_get_lines`, `export_to_xlsx`)
- `backend/services/tool_context.py::ToolContext` (`odoo`, `source_path` suffisent — pas de nouveau champ)
- Pattern handler-mince + service-épais déjà éprouvé par `odoo_inspect_report` (`backend/services/view_service.py`)

---

## Vérification end-to-end

1. **Backend** :
   ```bash
   source .venv/bin/activate
   pytest tests/test_skill_registry_integrity.py tests/test_tool_limits.py -q
   pytest tests/test_trigger_routing.py -q                 # 34/34 skills couverts, 0 xfail
   pytest tests/test_skill_quality.py -q
   pytest -q                                                # full sweep
   ```

2. **Frontend** :
   ```bash
   cd frontend
   npm test
   npm run build
   ```

3. **Quality eval (routing)** :
   ```bash
   python scripts/quality_eval/run_routing_eval.py
   ```
   Ajouter ~ 4 prompts représentatifs dans `dataset.json` (bilan client, P&L projet, explain formula, list spreadsheets) — 100 % accuracy maintenu.

4. **Tests manuels app** (`bash scripts/start.sh`) :
   - Assistant : « donne-moi le bilan du client Acme au 31/03/2026 » → résolution partner via `query_odoo` puis appel `inspect_financial_reports action=run`, réponse contient tableau Markdown des lignes et totaux.
   - Assistant : « P&L du projet PRJ-42 sur Q1 2026 » → résolution `analytic_account_id` puis `run`.
   - Assistant : « quel rapport pour la déclaration TVA T1 ? » → `action=recommend`, top 3 avec justification.
   - Assistant : « explique cette formule =ODOO.PIVOT("1",...) » → `inspect_spreadsheet action=explain_formula`.
   - Assistant : « inspecte le spreadsheet Budget 2026 et liste ses formules ODOO » → `inspect` retourne sheets + inventaire formules.

5. **Versioning** : bump `0.95.0`, About + README + CLAUDE.md alignés, commit `v0.95.0 — inspect-financial-reports + inspect-spreadsheet`.

---

## Risques et atténuations

- **`_get_lines` peut être lent** sur grand ledger / multi-société → bornes : `max_lines=500`, timeout XML-RPC standard, message `truncated` clair.
- **Format spreadsheet hétérogène** (JSON natif vs XLSX zippé selon version) → `_parse_spreadsheet_payload` qui détecte magic bytes et choisit le bon décodeur ; fail-loud si format inconnu.
- **Catalogue formules `ODOO.*` dépendant des sources Enterprise locales** → si `source_path-enterprise` absent, `explain_formula` / `suggest_formula` fallback sur `references/odoo_spreadsheet_formulas.md` statique avec un warning explicite.
- **Fuites de routing avec `query_odoo`** (très tentant sur « donne-moi les factures non payées de X ») → règles de pruning serrées + eval queries near-miss explicites.
- **Sortie XLSX de `export_to_xlsx`** peut dépasser 5 MB → garde-fou taille, sinon retourne consigne de passer par l'UI Odoo.
- **Risque évolution future « modifier le rapport »** : volontairement hors scope v0.95.0 — toute écriture passera plus tard par un workflow Creator dédié, jamais par ce skill.

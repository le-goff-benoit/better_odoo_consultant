# Options d'exécution

Format attendu par le skill :

```json
{
  "date_from": "2026-01-01",
  "date_to": "2026-03-31",
  "partner_ids": [12],
  "analytic_account_ids": [7],
  "company_ids": [1],
  "journal_ids": [3],
  "unfold_all": false,
  "comparison": "previous_period"
}
```

Résolution recommandée :

- Client : chercher `res.partner` par `name ilike`.
- Projet : chercher `project.project`, puis `analytic_account_id`, ou chercher `account.analytic.account`.
- Société : chercher `res.company`.
- Journal : chercher `account.journal`.

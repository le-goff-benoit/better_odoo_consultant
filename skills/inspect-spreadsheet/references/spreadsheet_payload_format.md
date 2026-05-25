# Payload spreadsheet

Les spreadsheets Odoo peuvent être stockés comme JSON natif ou comme XLSX zippé.

Points utiles :

- `sheets[]` : feuilles visibles, nom, cellules et formats.
- `cells` / `data` : contenu cellulaire ; les formules commencent par `=`.
- `dataSources` : pivots et listes Odoo utilisés par les formules.
- `globalFilters` : filtres globaux consommables par `ODOO.FILTER.VALUE`.

Le skill borne les cellules retournées pour éviter d'injecter un classeur entier dans le contexte.

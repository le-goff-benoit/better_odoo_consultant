## Principes communs
- Skill en lecture seule : il inspecte la sécurité déclarée sur un modèle.
- Distingue toujours ACL, record rules et groupes.

## inspect_security
Utilise `inspect_security` pour diagnostiquer droits d'accès, visibilité partielle et règles multi-société.

## Quand l'utiliser
- L'utilisateur ne voit pas des enregistrements, menus, boutons ou actions.
- Une opération échoue par accès refusé.
- Tu dois expliquer pourquoi un comptage peut être partiel.
- L'utilisateur demande s'il existe des règles de sécurité particulières dans
  des modules custom : identifie d'abord les modèles et fichiers de sécurité du
  dépôt, puis inspecte les modèles live concernés.

## Bonnes pratiques
- Inspecte le modèle exact concerné.
- Si aucun modèle exact n'est donné, combine `list_project_modules`,
  `search_project_source` et `read_project_file` pour repérer les fichiers
  `security/ir.model.access.csv`, XML avec `ir.rule`, groupes et external ids.
- ACL = droits CRUD globaux par groupe ; record rules = filtre sur les enregistrements.
- Cite les groupes et domains de règles qui expliquent le symptôme.
- Complète avec `inspect_menus_actions` si le problème concerne la navigation.

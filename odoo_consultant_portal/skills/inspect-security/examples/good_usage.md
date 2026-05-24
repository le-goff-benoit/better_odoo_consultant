# Usage canonique — inspect_security

**Prompt utilisateur** : « Pourquoi les commerciaux ne voient pas toutes les opportunités ? »

**Tool call attendu** :
```json
{
  "name": "inspect_security",
  "arguments": { "model": "crm.lead" }
}
```

**Pourquoi ces arguments** :
- `model="crm.lead"` : les opportunités vivent sur `crm.lead` (même modèle que les leads, le type est un champ).
- C'est la première étape de tout diagnostic « X ne voit pas Y » : lister ACL + record rules + groupes pour comprendre les filtres déclarés.

**Résultat retourné** :
```json
{ "ok": true,
  "model": { "id": 142, "name": "Lead/Opportunity", "model": "crm.lead", "transient": false },
  "access_controls": [
    { "id": 89, "name": "crm.access.lead.salesman", "group_id": [13, "Sales/User: Own Documents Only"],
      "perm_read": true, "perm_write": true, "perm_create": true, "perm_unlink": false },
    { "id": 90, "name": "crm.access.lead.manager", "group_id": [14, "Sales/Administrator"],
      "perm_read": true, "perm_write": true, "perm_create": true, "perm_unlink": true }
  ],
  "record_rules": [
    { "id": 12, "name": "Personal Leads", "domain_force": "[('user_id','=',user.id)]",
      "groups": [[13, "Sales/User: Own Documents Only"]], "perm_read": true, "global": false },
    { "id": 13, "name": "All Leads", "domain_force": "[(1,'=',1)]",
      "groups": [[14, "Sales/Administrator"]], "perm_read": true, "global": false }
  ]}
```

**Interprétation côté assistant** :
> Diagnostic : les commerciaux du groupe **« Sales/User: Own Documents Only »** sont limités par la record rule **« Personal Leads »** qui filtre `user_id = user.id` — chacun ne voit que ses propres opportunités.
>
> Trois options selon le besoin :
> 1. **Promouvoir** les commerciaux en `Sales/Administrator` → ils voient tout (peut être excessif).
> 2. **Créer un groupe intermédiaire** « Commercial — équipe complète » avec une record rule `team_id in user.team_ids` pour ne voir que les opportunités de son équipe.
> 3. **Modifier la rule existante** en `user_id = user.id OR user_id IN team.member_ids` (plus permissif mais moins propre).
>
> Précise le besoin métier (voir l'équipe ? la zone géographique ? tout ?) et je te détaille la solution exacte.

**Pièges à éviter** :
- Une record rule **sans groupe** (`groups: []`) s'applique à **tout le monde**, y compris l'admin technique. Cas classique de « je vois plus rien en admin ».
- `global=True` ignore les groupes et s'applique à tous — encore plus radical.
- L'ordre OR entre ACL : si un user appartient à plusieurs groupes, il **cumule** les ACL (le plus permissif gagne). Les record rules, elles, se **cumulent en AND** (la plus restrictive gagne) sauf pour les rules sans groupes (s'appliquent en plus).
- `sudo()` côté code Python court-circuite TOUT — un compute en sudo voit tout, ce n'est pas un bug de sécurité.

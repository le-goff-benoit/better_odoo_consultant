# Menus et actions Odoo — graphe d'accès

Référence chargée à la demande quand le prompt évoque navigation, menu, action, ou « où je clique pour... ».

## Le triangle Menu → Action → Vue

```
ir.ui.menu              ir.actions.act_window          ir.ui.view
"Sales / Quotations" → "Quotations (sale.order, ...)"  → vue list/form/...
```

Trois entités liées :
- **Menu** : ce qui s'affiche dans la barre de navigation. Hiérarchie via `parent_id`.
- **Action** : ce qui se déclenche au clic. Définit le modèle, le domain, les vues, la cible (popup/onglet).
- **Vue** : ce qui s'affiche dans la zone principale. Plusieurs vues par action (`view_mode="list,form,kanban"`).

## Types d'actions

### `ir.actions.act_window` (le plus courant)

Ouvre un écran avec une liste/form/kanban d'un modèle.

```python
{
    "name": "Quotations",
    "res_model": "sale.order",
    "view_mode": "list,form,kanban,calendar,pivot,graph",
    "domain": "[('state', 'in', ['draft', 'sent'])]",
    "context": "{'default_user_id': uid}",
    "target": "current",   # "current" | "new" (popup) | "main" (nouvel onglet)
}
```

### `ir.actions.server`

Exécute du code Python serveur. Pas d'écran.

```python
{
    "name": "Bulk confirm",
    "state": "code",
    "model_id": <id sale.order>,
    "code": "records.action_confirm()",
}
```

### `ir.actions.report`

Génère un PDF/HTML/text à partir d'un template QWeb.

```python
{
    "name": "Invoice",
    "report_name": "account.report_invoice",
    "report_type": "qweb-pdf",
    "model": "account.move",
}
```

### `ir.actions.client`

Lance un client-side (JavaScript). Ex. `sale.action_open_sale_dashboard`.

```python
{
    "name": "Dashboard",
    "tag": "sale_dashboard",   # nom d'un widget OWL/JS enregistré
}
```

### `ir.actions.act_url`

Redirige vers une URL externe.

## Hiérarchie des menus

`ir.ui.menu` est un arbre :

```
- Sales                         ← parent_id NULL, root menu
  - Orders                      ← parent_id = Sales
    - Quotations                ← parent_id = Orders, action = "Quotations"
    - Sales Orders              ← parent_id = Orders
  - Configuration               ← parent_id = Sales
    - Settings                  ← parent_id = Configuration
```

Le champ `complete_name` (depuis 13+) calcule la chaîne `Sales / Orders / Quotations` automatiquement.

`parent_path` (`/4/12/47/`) est l'index matériel utilisé pour les requêtes hiérarchiques rapides.

## Accès et visibilité

### `groups_id` (sur menu ET action)

Liste de groupes autorisés à voir le menu/action. Si vide = visible par tout user connecté.

### `active=False`

Désactive le menu sans le supprimer (utile pour les modules optionnels).

### Différence avec ACL/record rules

Visibilité menu ≠ droit sur les données :
- Un user peut voir le menu « Sales Orders » mais avoir une record rule qui ne retourne que ses propres commandes.
- Inverse possible : pas de menu visible mais accès aux données via une autre route (API, autre action).

Diagnostic « pourquoi l'utilisateur voit/ne voit pas X » : croiser `odoo_inspect_navigation` + `odoo_inspect_security`.

## Patterns courants

### Une action avec plusieurs vues

`view_mode="list,form,kanban,calendar"` : Odoo génère 4 boutons d'affichage en haut. Les vues spécifiques sont résolues par `(model, view_type)`. Pour forcer une vue précise : `views=[(123, 'list'), (124, 'form')]`.

### Une action avec un context par défaut

```python
"context": "{'default_partner_id': active_id, 'search_default_my_quotations': 1}"
```

- `default_<field>` : pré-remplit le champ à la création.
- `search_default_<filter>` : active un filtre par défaut.

### Une action depuis un bouton de formulaire

Dans une vue XML :
```xml
<button name="action_my_method" type="object" string="Validate"/>
```

`type="object"` → appelle une méthode Python. `type="action"` → ouvre une autre action via son xml_id.

## Pièges

- Une action existe **sans menu** si elle est appelée seulement depuis un bouton ou un programme. Le champ `menus` retourné par `odoo_inspect_navigation` est souvent vide pour ce cas — c'est normal.
- Plusieurs actions peuvent pointer sur le **même modèle** avec des domains différents (ex. « Quotations » = `state ∈ {draft, sent}`, « Sales Orders » = `state = 'sale'`). C'est la clé pour expliquer ce que l'utilisateur voit selon le menu cliqué.
- Le `domain` peut référencer `uid` (= l'utilisateur connecté) ou `context_today()` — c'est évalué à chaque ouverture.
- Studio crée des actions avec des xml_id du type `studio_customization.xxx_yyy` — pas toujours lisibles. Préférer `odoo_inspect_studio` pour les inventorier.

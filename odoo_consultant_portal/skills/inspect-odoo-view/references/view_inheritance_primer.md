# Héritage de vues Odoo — primer

Référence chargée à la demande quand le prompt évoque xpath, héritage de vue, view inheritance, ou conflit entre modules sur une vue.

## Les deux modes : `primary` vs `extension`

```python
<record id="view_order_form" model="ir.ui.view">
    <field name="name">sale.order.form</field>
    <field name="model">sale.order</field>
    <field name="mode">primary</field>     # ou "extension"
    <field name="inherit_id" ref="sale.view_order_form"/>   # uniquement si extension
    <field name="arch" type="xml">...</field>
</record>
```

| Mode | Comportement |
|---|---|
| `primary` | Vue **autonome**. Visible dans la liste des vues du modèle. Si `inherit_id` est rempli, l'arch sert de **base** + patches xpath. |
| `extension` (défaut quand `inherit_id` est rempli) | **Patche** la vue parente sans créer de nouvelle vue indépendante. C'est ce que font 95% des modules. |

**Quand utiliser `primary`** :
- Tu veux exposer une vue alternative (ex. « commande version simplifiée ») accessible via action dédiée.
- Tu remplaces complètement la vue (rare, fragile).

## Priorité et ordre d'application

Champ `priority` (entier, défaut 16). Plus c'est élevé, plus c'est appliqué **tard** (donc gagne).

Ordre type sur `sale.order` form :
1. `sale.view_order_form` (vue de base, primary, priority 16)
2. `sale_stock.view_order_form_inherit_sale_stock` (extension, priority 16) — ajoute l'onglet livraison
3. `sale_management.sale_order_form_quote` (extension, priority 16) — ajoute des actions
4. `studio_customization.odoo_studio_sale_order_xxx` (extension, priority 100) — modifs Studio

À priority égale, l'ordre **alphabétique du xml_id** tranche (instable entre versions Odoo).

Pour qu'un module custom passe APRÈS Studio : `priority=200+`.

## Syntaxe xpath

### Cibler un élément

```xml
<xpath expr="//field[@name='partner_id']" position="after">
    <field name="x_custom_field"/>
</xpath>
```

| Expression | Cible |
|---|---|
| `//field[@name='partner_id']` | Le premier `<field name="partner_id">` à tout niveau |
| `//notebook/page[@name='order_lines']` | La page nommée order_lines du premier notebook |
| `//header/button[@name='action_confirm']` | Un bouton précis dans le header |
| `//group[2]/field[@name='date_order']` | Le 2e group, son champ date_order |

### Positions disponibles

| `position=` | Effet |
|---|---|
| `after` | Insère **après** l'élément ciblé |
| `before` | Insère **avant** |
| `inside` (défaut) | Insère **dans** (à la fin des enfants) |
| `replace` | Remplace l'élément entier — **dangereux**, casse les héritages suivants |
| `attributes` | Modifie les attributs sans toucher au contenu |

### Raccourci sans xpath

```xml
<field name="partner_id" position="after">
    <field name="x_custom"/>
</field>
```

Équivaut à `<xpath expr="//field[@name='partner_id']" position="after">`. Plus lisible, mais ne fonctionne que pour le premier match.

### Modifier des attributs

```xml
<field name="partner_id" position="attributes">
    <attribute name="readonly">1</attribute>
    <attribute name="domain">[('customer_rank', '>', 0)]</attribute>
</field>
```

Setter `''` pour vider un attribut : `<attribute name="invisible"></attribute>`.

## Patterns à éviter

### `position="replace"` sans précaution

Casse silencieusement tous les modules qui héritent après toi. Si tu **dois** remplacer, fais un `position="replace"` partiel + redéclare ce que tu retires.

### Sélecteurs trop génériques

`//field` (= n'importe quel champ) → matche le premier rencontré, qui peut bouger d'une version à l'autre. Toujours qualifier avec `[@name='...']`.

### `<xpath expr="//page[@string='Order Lines']">`

Les strings sont **traduits** dans les vues. En anglais ça marche, en français le `string` devient « Lignes de commande » et l'xpath casse. Préférer `<xpath expr="//page[@name='order_lines']">` (le `name` n'est jamais traduit).

## Cas Studio

Studio écrit ses modifications comme des extensions :

```xml
<record id="odoo_studio_sale_order_xxx" model="ir.ui.view">
    <field name="model">sale.order</field>
    <field name="inherit_id" ref="sale.view_order_form"/>
    <field name="mode">extension</field>
    <field name="priority">100</field>
    <field name="arch" type="xml">
        <xpath expr="//field[@name='date_order']" position="after">
            <field name="x_studio_signature_date"/>
        </xpath>
    </field>
</record>
```

L'xml_id est `studio_customization.<hash>` — illisible mais valide.

## Cas particuliers

### Hériter une vue Studio

C'est possible (mode=extension, inherit_id pointant sur l'xml_id Studio) mais déconseillé : Studio peut régénérer la vue avec un nouvel xml_id à tout moment, cassant ton extension.

Bonne pratique : hériter la vue **de base** Odoo, pas la vue Studio.

### Vue qui apparaît vide

Souvent un `position="replace"` mal calibré dans un module récent. Diagnostic : `inspect_odoo_view` pour voir la chaîne d'héritage et identifier qui a tué la vue.

### Modifications conditionnelles selon le groupe

```xml
<field name="x_internal_note" groups="base.group_user"/>
```

L'attribut `groups` restreint l'affichage à un groupe. Différent des ACL (`inspect_security`) qui contrôlent l'accès **données**.

## Outils complémentaires

- `inspect_odoo_view` : voir l'arch assemblée d'une vue et sa chaîne d'héritage.
- `search_odoo_source` : chercher des patterns xpath réels dans le code Odoo standard pour s'inspirer.
- `inspect_studio` : inventaire des modifications Studio sur le projet.

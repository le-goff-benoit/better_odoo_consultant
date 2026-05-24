# Usage canonique — odoo_inspect_studio

**Prompt utilisateur** : « Fais-moi un audit de tout ce qui a été personnalisé via Studio sur ce projet. »

**Tool call attendu** :
```json
{
  "name": "odoo_inspect_studio",
  "arguments": { "sections": ["all"] }
}
```

**Pourquoi ces arguments** :
- `sections=["all"]` : audit exhaustif demandé. Pour des cas ciblés, utiliser `["models"]`, `["fields"]`, `["views"]`, `["menus"]`, `["automations"]`.
- Pas de `model_filter` : on veut voir tous les modèles touchés. Le `model_filter` est utile pour zoomer sur un modèle particulier (ex. `"sale.order"`).

**Résultat retourné** (extrait condensé) :
```json
{ "ok": true,
  "summary": {
    "studio_models": 3,
    "studio_fields": 47,
    "studio_views": 18,
    "studio_menus": 2,
    "studio_automations": 4
  },
  "studio_fields_by_model": {
    "sale.order": [
      { "name": "x_studio_commission_amount", "type": "monetary" },
      { "name": "x_studio_origine_lead", "type": "many2one" }
    ],
    "res.partner": [...]
  },
  "studio_models": ["x_pricing_grid", "x_commercial_zone", "x_studio_visit"],
  "studio_automations": [
    { "name": "Notif RC sur commande > 50k", "model": "sale.order", "trigger": "on_create_or_write" }
  ]}
```

**Interprétation côté assistant** :
> Inventaire Studio du projet :
>
> **Modèles custom (3)** : `x_pricing_grid`, `x_commercial_zone`, `x_studio_visit`. À documenter — ce sont des nouvelles entités métier.
>
> **Champs Studio (47 sur 8 modèles)** : majorité sur `sale.order` (12 champs) et `res.partner` (9 champs). Voir le détail par modèle ci-dessous.
>
> **Vues (18)** : essentiellement des extensions de vues existantes pour afficher les nouveaux champs. À vérifier qu'aucune ne casse l'héritage standard.
>
> **Automatisations (4)** : 1 notification commerciale, 3 mises à jour de champs. La règle « Notif RC sur commande > 50k » envoie un mail à chaque modification d'une commande > 50 k€ — vérifier qu'elle ne spamme pas en cas de modifications fréquentes.
>
> Risques principaux : (a) champs Studio sur `sale.order` couplés à du code custom Python — fragile en migration ; (b) modèles `x_*` non documentés. Recommande un audit code en parallèle.

**Pièges à éviter** :
- Studio stocke ses changements dans le module `studio_customization` (`ir.model.data`). Si le projet a aussi des modules custom code, les deux **coexistent** — `odoo_inspect_studio` ne voit que Studio.
- Un champ Studio sur un modèle standard (ex. `sale.order.x_studio_commission`) ne migre pas automatiquement entre versions Odoo : à recréer manuellement en cas de bump.
- Certaines vues Studio sont stockées en mode `mode='extension'` avec xpath — vérifiables via `odoo_inspect_view` pour comprendre ce qu'elles modifient.
- Les modèles `x_studio_*` ne supportent **pas** toutes les vues (cf. `odoo_inspect_studio/references/studio_limits.md`).

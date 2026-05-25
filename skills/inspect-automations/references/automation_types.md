# Types d'automatismes Odoo

- `ir.cron` : tâche planifiée, déclenchement temporel, champs utiles `interval_number`, `interval_type`, `nextcall`, `code`.
- `base.automation` : action automatisée liée à un modèle, souvent sur création, écriture ou condition filtrée.
- `ir.actions.server` : action serveur réutilisable, parfois appelée par bouton, menu, automatisation ou cron.
- `mail.template` : template email, souvent utilisé par actions serveur, workflow commercial ou automatisation.

Pour une analyse migration, relever les records sans XML-ID, car ils viennent souvent d'une configuration locale à documenter.

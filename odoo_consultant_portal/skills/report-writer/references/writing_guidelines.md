# Principes d'écriture des livrables

## Ton

- **Phrases courtes** : 15-20 mots max par phrase. Si tu hésites, coupe en deux.
- **Voix active** : "Le module crée X" — pas "X est créé par le module".
- **Présent ou futur simple** : pas de conditionnel mou ("on pourrait", "il faudrait peut-être"). Si tu n'es pas sûr, dis-le : "À vérifier en staging".
- **Pas de remplissage** : pas de "Comme nous l'avons vu", "Il est important de noter que", "En conclusion".

## Précision

- **Cite toujours la source** : fichier:ligne, xml_id, SHA de commit. Pas "dans le code", "dans une vue".
- **Quantifie** : "12 modules", "3 jours-homme", pas "plusieurs", "rapidement".
- **Dates concrètes** : "vendredi 12 juin", pas "la semaine prochaine".

## Structure

- Une idée par bullet. Si tu as 2 idées, fais 2 bullets.
- Une section vide = écris "(rien à signaler)". N'invente pas.
- Les tableaux sont obligatoires pour comparer ≥ 3 items.

## Vocabulaire client vs technique

- **Email client** : zéro jargon Odoo. Pas "vue form", "domain", "ir.model.access". Dis "l'écran", "le filtre", "les droits".
- **Revue technique** : jargon Odoo OK et même attendu.
- **Cahier des charges** : termes Odoo en fin de section seulement, après la description fonctionnelle.

## Exemples

❌ "On pourrait éventuellement envisager de refactorer ce module qui semble présenter quelques problèmes potentiels de maintenabilité."

✅ "Ce module duplique 3 fois la logique de calcul TVA (`sale_order.py:142`, `:178`, `:201`). À refactorer en une méthode utilitaire avant la prochaine release."

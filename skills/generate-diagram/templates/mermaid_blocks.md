```mermaid
%%{init: {'flowchart': {'curve': 'linear', 'htmlLabels': true, 'nodeSpacing': 65, 'rankSpacing': 75}}}%%
flowchart TD
  A["<b>Point de départ</b><br/>Contexte ou acteur initial"]:::start
  B["<b>Étape suivante</b><br/>Action métier lisible"]:::action
  C{"<b>Décision</b><br/>Critère explicite"}:::decision
  D["<b>Résultat</b><br/>Sortie attendue"]:::success

  A --> B
  B --> C
  C --> D

  classDef start fill:#EFF6FF,stroke:#2563EB,stroke-width:1.5px,color:#0F172A;
  classDef action fill:#F8FAFC,stroke:#CBD5E1,stroke-width:1px,color:#111827;
  classDef decision fill:#FEF3C7,stroke:#D97706,stroke-width:1.5px,color:#78350F;
  classDef success fill:#DCFCE7,stroke:#16A34A,stroke-width:1.5px,color:#14532D;
```

Légende : préciser le périmètre, la source des données et les éléments volontairement exclus.

Checklist qualité :
- chaque carte commence par `<b>Titre</b>` ;
- liens linéaires, courts et orientés dans le même sens ;
- pas de longues boucles de retour ni de branches qui traversent tout le diagramme ;
- 3-5 classes visuelles maximum ;
- si le diagramme devient dense, créer des sous-graphes ou deux diagrammes.

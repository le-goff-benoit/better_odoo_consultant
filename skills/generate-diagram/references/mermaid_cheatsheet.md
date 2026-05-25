# Mermaid rapide — standard joli

## Flowchart

```mermaid
%%{init: {'flowchart': {'curve': 'linear', 'htmlLabels': true, 'nodeSpacing': 65, 'rankSpacing': 75}}}%%
flowchart TD
  start["<b>Départ</b><br/>Demande reçue"]:::start
  check{"<b>Décision</b><br/>Critère clair ?"}:::decision
  action["<b>Action</b><br/>Traitement principal"]:::action
  done["<b>Résultat</b><br/>Sortie validée"]:::success

  start --> check
  check --> action
  action --> done

  classDef start fill:#EFF6FF,stroke:#2563EB,stroke-width:1.5px,color:#0F172A;
  classDef action fill:#F8FAFC,stroke:#CBD5E1,stroke-width:1px,color:#111827;
  classDef decision fill:#FEF3C7,stroke:#D97706,stroke-width:1.5px,color:#78350F;
  classDef success fill:#DCFCE7,stroke:#16A34A,stroke-width:1.5px,color:#14532D;
```

Règles visuelles :

- Chaque carte a un titre court en gras puis une ligne de détail.
- Les liens restent simples et directs : `A --> B`, pas de longs retours arrière.
- Utiliser `curve: linear` pour éviter les liens courbes libres.
- Limiter les labels de liens aux branches de décision indispensables.
- Si le flux a plusieurs domaines, utiliser des `subgraph` pour séparer les zones.

## Class diagram

```mermaid
classDiagram
  class SaleOrder {
    +amount_total
    +action_confirm()
  }
  Model <|-- SaleOrder
```

Règles : IDs ASCII simples, libellés courts, pas de diagramme de plus de 60 nœuds dans une réponse. Pour un rendu client, préférer 8 à 14 cartes maximum par diagramme et créer une deuxième vue si nécessaire.

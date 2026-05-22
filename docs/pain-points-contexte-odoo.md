# Pain points du consultant Odoo & moteur de contexte — référence fonctionnelle

> **Statut : ébauche exhaustive (à itérer).** Document de cadrage interne **et** référence
> fonctionnelle.
>
> **Audience.** Ce document est écrit pour être lisible par un **manager n+1** — sans
> prérequis de développement Odoo — qui veut (1) comprendre *pourquoi* l'application
> existe, et (2) disposer d'une **référence fonctionnelle** des mécanismes de **gestion de
> contexte projet** : comment le contexte se modifie selon les **critères projet**, ce que
> sont les **profils de réponse**, et comment tout cela influence la qualité des réponses.
>
> Ce document **ne contient pas** de guide technique (architecture de code, chemins de
> fichiers) : il décrit le comportement **fonctionnel** observable.
>
> **Comment lire ce document.**
> - §1 à §6 — le **problème** : pourquoi les outils de prompting standards échouent.
> - §7 — la **réponse** de l'application, au niveau conceptuel.
> - §8 — **référence fonctionnelle : les critères projet** et leurs effets sur le contexte.
> - §9 — **référence fonctionnelle : les profils de réponse** et les modes de travail.
> - §10 à §12 — comparatif, limites, suite.
>
> Document lié : `README.md` → section *« Qualité des réponses IA — Sources & contexte »*
> (vue utilisateur).

---

## Table des matières

1. [Objet et thèse](#1-objet-et-thèse)
2. [Glossaire](#2-glossaire)
3. [Le travail réel du consultant Odoo](#3-le-travail-réel-du-consultant-odoo)
4. [Pain points — les outils de prompting standards](#4-pain-points--requêter-odoo-avec-les-outils-de-prompting-standards)
5. [Focus NotebookLM — un contexte gelé](#5-focus--notebooklm-gemini--un-bon-outil-mais-un-contexte-gelé)
6. [ChatGPT / Gemini — même limite](#6-chatgpt--gemini-chat-web--même-limite-sans-même-lancrage)
7. [La réponse de Better Odoo Assistant](#7-la-réponse-de-better-odoo-assistant--un-contexte-vivant)
8. [Référence fonctionnelle — les critères projet](#8-référence-fonctionnelle--les-critères-projet-et-leurs-effets)
9. [Référence fonctionnelle — les profils de réponse](#9-référence-fonctionnelle--les-profils-de-réponse-et-les-modes-de-travail)
10. [Tableau comparatif récapitulatif](#10-tableau-comparatif-récapitulatif)
11. [Limites et points ouverts](#11-limites-et-points-ouverts)
12. [Questions ouvertes pour la suite](#12-questions-ouvertes-pour-la-suite)

---

## 1. Objet et thèse

Un consultant Odoo passe une grande partie de son temps à **poser des questions sur un
système** : où est défini ce champ ? que fait cette méthode ? ce comportement vient-il du
standard ou d'un module custom ? quelle valeur a réellement cet enregistrement en base ?

Les assistants IA généralistes (ChatGPT, Gemini) ou semi-spécialisés (NotebookLM) promettent
de répondre à ces questions. En pratique, ils échouent de façon **systématique et prévisible**
sur le travail Odoo réel. Ce document identifie pourquoi, puis décrit fonctionnellement la
solution mise en œuvre.

> **Thèse du document.** Le bon contexte de travail n'est ni *figé* ni *flou*. Il est à la
> fois **défini** — un périmètre explicite, stable et reproductible sur des **critères
> clés** — et **vivant** — alimenté par un code source servant de « documentation » de
> référence, **tenu à jour**. NotebookLM confond les deux : en *définissant* le contexte
> une fois, il en *gèle* aussi le contenu. Tout l'enjeu est de **séparer la *définition* du
> contexte (stable, contrôlée, vérifiable) de son *contenu* (frais, reconstitué à l'état
> courant)**. C'est le fil conducteur des sections 7, 8 et 9.

---

## 2. Glossaire

Vocabulaire minimal pour lire le reste sans être développeur Odoo.

| Terme | Définition courte |
|---|---|
| **Odoo** | Progiciel de gestion (ERP) open source. Existe en plusieurs **versions** annuelles (15.0, 16.0, 17.0, 18.0, 19.0…). |
| **Community / Enterprise** | Deux **éditions** d'Odoo. Community est libre ; Enterprise est payante et ajoute des modules (compta avancée, abonnements, signature…). |
| **Module** | Brique fonctionnelle d'Odoo (ex. `sale`, `account`). Le code d'un client est lui aussi packagé en **modules custom**. |
| **Modèle / champ** | Un *modèle* est une table métier (`sale.order`) ; un *champ* est une colonne (`amount_untaxed`). C'est le vocabulaire de base d'une question Odoo. |
| **`_inherit` / override** | Mécanismes par lesquels un module custom **étend** ou **modifie** un comportement standard d'Odoo. |
| **Odoo Studio** | Éditeur **no-code** d'Odoo : il permet de créer modèles, champs, vues, automatisations **sans écrire de code ni faire de commit**. Ces personnalisations vivent **dans la base de données**. |
| **Instance** | Une base de données Odoo en service chez un client (production, staging…). |
| **Données live** | Les vraies données d'une instance, lues en direct (par opposition à une connaissance théorique). |
| **LLM** | *Large Language Model* — le moteur IA (Claude, GPT, Gemini). Connaît Odoo « en moyenne », pas le projet précis. |
| **Contexte (d'une requête IA)** | L'ensemble des informations fournies au LLM *en plus* de la question, pour qu'il réponde juste. |
| **RAG** | *Retrieval-Augmented Generation* — technique consistant à retrouver des extraits de documents et à les joindre à la question. NotebookLM fonctionne ainsi. |
| **Profil de réponse (perspective)** | Le « point de vue » sous lequel l'assistant répond : Support, Business Analyst, Architecte ou Développeur. Voir §9. |
| **Mode de travail** | Le cadre de la session : Assistant (questions/réponses), Migration (comparaison de versions), Creator (modifications). Voir §9.3. |
| **Snapshot** | Copie figée d'un contenu à un instant T. |

---

## 3. Le travail réel du consultant Odoo

Pour comprendre les pain points, il faut comprendre ce qui rend une mission Odoo
particulière du point de vue de l'information :

| Caractéristique du terrain | Conséquence pour un assistant IA |
|---|---|
| **Plusieurs versions coexistent** — un consultant jongle entre des clients en 14.0, 16.0, 17.0, 18.0… | Une réponse correcte pour une version est fausse pour une autre. La « bonne réponse » dépend du client. |
| **Community ≠ Enterprise** — la compta, les abonnements, la signature, le MRP avancé… vivent dans `enterprise`. | Un modèle entraîné « en moyenne » mélange les deux éditions. |
| **Chaque client a du code custom** — modules spécifiques, héritages (`_inherit`), overrides. | Ce code n'existe **nulle part** dans les données d'entraînement d'un LLM. Il est, par construction, inconnu. |
| **Le no-code (Studio) ajoute une couche invisible** — modèles `x_`, champs custom, automatisations, vues modifiées. | Ces personnalisations ne sont pas dans le dépôt de code ; elles vivent **dans la base de données**. |
| **La mission dure dans le temps** — la version est mise à jour, des modules sont déployés, les données évoluent chaque jour. | Tout contexte figé à un instant T devient progressivement faux. |
| **Confidentialité** — le code et les données d'un client ne doivent pas fuiter vers un autre, ni vers un tiers. | L'isolation par projet n'est pas un confort, c'est une exigence. |

Autrement dit : la « vérité » dont le consultant a besoin est **spécifique, distribuée sur
plusieurs sources, et mouvante**. C'est exactement le profil de problème que les outils de
prompting standards gèrent mal.

---

## 4. Pain points — requêter Odoo avec les outils de prompting standards

### 4.1 Le modèle ne connaît pas *la* version exacte du client

Un LLM connaît Odoo « en général », à partir d'un corpus qui mélange plusieurs versions,
des forums, des tutoriels parfois datés. Quand on lui demande le nom d'un champ, il produit
une réponse **plausible en moyenne** — par exemple `amount_subtotal` au lieu de
`amount_untaxed` — sans pouvoir dire à quelle version elle correspond. Les renommages et
déplacements de champs entre versions sont précisément les cas où le consultant a besoin
d'aide, et précisément ceux où le modèle hallucine.

### 4.2 Le code custom du client est invisible

Les modules développés pour un client ne sont dans aucun corpus d'entraînement. Un assistant
généraliste ne peut pas savoir qu'un modèle standard a été étendu (`_inherit`), voir un champ
ajouté par un module custom, ni lire un override. Or **c'est là que se trouve la complexité
d'un projet en production**.

### 4.3 Les données réelles de l'instance sont inaccessibles

Beaucoup de questions de mission sont des questions de **données**, pas de code : combien de
commandes en brouillon ? quels journaux comptables sont configurés ? Un chat web n'a aucun
accès à la base du client. Le consultant doit chercher la valeur lui-même.

### 4.4 Les personnalisations no-code (Studio) échappent au modèle

Studio permet de créer modèles, champs, vues, automatisations **sans code**. Ces
personnalisations vivent dans la base de données. Aucun outil de prompting standard ne peut
les inventorier.

### 4.5 Le contexte bouge pendant la mission — le pain point central

Même si, au prix d'un gros effort, le consultant réunissait toutes les sources le jour 1,
le terrain change : la version est mise à jour, de nouveaux modules sont déployés, les
données évoluent, de nouvelles personnalisations Studio sont créées. Un contexte assemblé
manuellement est **vrai à un instant T et faux ensuite** — l'outil **dérive silencieusement**.

### 4.6 Le copier-coller manuel ne passe pas à l'échelle

Coller le code dans le chat échoue sur du vrai Odoo : le code source (Community + Enterprise)
représente des **milliers de fichiers** ; la fenêtre de contexte est limitée ; il n'y a pas
de **navigation** ; et ce n'est **pas reproductible**.

### 4.7 Pas d'isolation par client

Dans un chat web, tous les échanges vivent dans le même espace. Mélanger plusieurs clients
crée un risque de **pollution de contexte** et de **confidentialité**.

### 4.8 Aucune traçabilité : « savoir » vs « inventer »

Un assistant généraliste ne distingue pas, dans sa réponse, ce qu'il a *lu* d'une source
fiable de ce qu'il *suppose*. Le consultant ne peut pas faire la différence sans tout
revérifier.

### Synthèse des pain points

| # | Pain point | Conséquence concrète en mission |
|---|---|---|
| 4.1 | Version exacte inconnue du modèle | Noms de champs / méthodes hallucinés, faux pour le client |
| 4.2 | Code custom invisible | L'IA ignore héritages, overrides, champs custom |
| 4.3 | Données live inaccessibles | Toute question « chiffre / config » oblige à un aller-retour manuel |
| 4.4 | Studio invisible | Personnalisations no-code totalement absentes des réponses |
| 4.5 | Le contexte change dans le temps | Réponses progressivement obsolètes ; entretien manuel jamais fait |
| 4.6 | Copier-coller non scalable | Fragments partiels, pas de navigation, rien de reproductible |
| 4.7 | Pas d'isolation par client | Pollution de contexte + risque de confidentialité |
| 4.8 | Pas de traçabilité | Impossible de distinguer réponse vérifiée et supposition |

---

## 5. Focus : NotebookLM (Gemini) — un bon outil, mais un contexte gelé

NotebookLM est le candidat le plus sérieux : contrairement à un chat généraliste, il
**ancre** ses réponses dans des sources fournies par l'utilisateur. C'est la bonne intuition.
Mais son architecture le rend inadapté à une mission Odoo qui dure.

### 5.1 Ce que fait NotebookLM

NotebookLM est un outil de **RAG sur sources fournies** : on crée un *notebook*, on y ajoute
des sources (PDF, Google Docs / Sheets / Slides, pages web, YouTube, audio, images, texte
collé), puis on pose des questions. L'outil répond **uniquement** à partir de ces sources et
cite ses passages.

### 5.2 Ses points forts pour un consultant

- Réponses **ancrées** dans le matériel fourni, avec citations → moins d'hallucination qu'un
  chat libre.
- On *peut* y mettre du code source et de la documentation projet.
- Bon pour **synthétiser un corpus stable** : un cahier des charges, une doc fonctionnelle
  figée, des comptes rendus.

### 5.3 La limite structurelle : le contexte est **statique**

C'est le cœur du problème, et il rejoint directement le pain point 4.5.

- **NotebookLM stocke un instantané (snapshot) de chaque source au moment de l'import.**
  Il n'y a **pas de mise à jour automatique**.
- La détection de fraîcheur (« Click to sync with Google Drive ») ne fonctionne **que pour
  les sources Google Drive**. Les **pages web et les fichiers uploadés localement ne sont
  pas surveillés** : il faut les **réimporter à la main**.
- Il n'existe **pas de bouton « tout mettre à jour »**.

Conséquence pour une mission Odoo : on **définit le contexte à l'avance**, et il est **gelé**.
Dès que la version monte, qu'un module custom est déployé ou que les données évoluent, le
notebook répond sur une **réalité passée** et **dérive silencieusement**.

### 5.4 Les plafonds de sources face au volume d'Odoo

| Plan NotebookLM | Sources / notebook | Par source |
|---|---|---|
| Gratuit | 50 | jusqu'à ~500 000 mots ou 200 Mo (upload local) |
| Plus | 300 | idem |
| Ultra | 600 | idem |

Le code source d'Odoo (Community **+** Enterprise) compte des **milliers de fichiers**. On
finit par n'importer qu'un **sous-ensemble**, choisi *avant* de savoir ce qui sera utile.

### 5.5 L'absence d'outils : pas de live, pas de recherche, pas de Studio

NotebookLM **lit** des sources ; il **n'agit pas**. Il ne peut donc pas interroger la base du
client en direct, faire une recherche ciblée *à la demande* dans le code, ni inventorier les
personnalisations **Studio**.

### 5.6 Conclusion sur NotebookLM

NotebookLM résout **4.2** partiellement (si on importe le code) et **4.8** (citations), mais
**ne résout pas 4.1, 4.3, 4.4, 4.6, 4.7**, et **échoue précisément sur 4.5** — le pain point
central. Bon pour un corpus stable ; **inadapté à une mission Odoo vivante**.

---

## 6. ChatGPT / Gemini (chat web) — même limite, sans même l'ancrage

Les chats généralistes n'ont même pas l'ancrage de NotebookLM :

- **ChatGPT** : connaissance « moyenne » d'Odoo, pas de notion de version active, contexte
  réinjecté à la main à chaque session, pas d'accès au code custom ni au live. Les fonctions
  de fichiers/projets restent un **import manuel et statique**.
- **Gemini** : même profil. Grande fenêtre de contexte, mais on ne peut pas y *coller* un
  Odoo complet, et ce qu'on colle est figé et choisi à l'aveugle.

Pour les deux : aucune isolation propre par client, aucune fraîcheur garantie, aucune
traçabilité « lu vs supposé ».

---

## 7. La réponse de Better Odoo Assistant — un **contexte vivant**

### 7.1 Principe : l'IA *lit*, elle ne *devine* pas

L'assistant ne s'appuie pas sur la connaissance « moyenne » du modèle. À chaque question, il
va **chercher la vérité au moment de la requête** : il consulte les **sources Odoo** de la
version exacte, le **dépôt de code custom** du client, interroge l'**instance en direct**
(en lecture seule), inventorie les personnalisations **Studio**. L'IA « ne sait plus » —
elle **vérifie**.

### 7.2 Définition *stable*, contenu *vivant* — le point clé

La différence fondamentale avec NotebookLM tient à une **séparation** que NotebookLM ne fait
pas :

- la **définition** du contexte — *quels* critères clés entrent en jeu (version, édition,
  dépôt, instance, contexte projet, profil de réponse) — doit être **explicite, stable et
  reproductible** ;
- le **contenu** de ce contexte — le code source, les données, l'inventaire Studio — doit
  être **reconstitué à l'état courant** à chaque requête.

```
        DÉFINITION (stable)                  CONTENU (vivant)
   ┌──────────────────────────┐     ┌────────────────────────────────┐
   │ • Version Odoo : 16.0    │     │ • Code source 16.0      ──┐     │
   │ • Édition : Enterprise   │     │ • Code custom du client   │ relu│
   │ • Dépôt : acme-prod      │ ──► │ • Données de l'instance   ├─ à  │
   │ • Profil : Architecte    │     │ • Personnalisations       │chaque
   │ • Contexte projet : …    │     │   Studio                ──┘requête
   └──────────────────────────┘     └────────────────────────────────┘
     déclaré une fois, modifiable      jamais figé : rafraîchi en continu

   NotebookLM fige les DEUX colonnes.  L'application ne fige que la GAUCHE :
   la définition reste stable, le contenu est toujours repris à l'état courant.
```

| | NotebookLM / ChatGPT / Gemini | Better Odoo Assistant |
|---|---|---|
| **Définition** du contexte | Implicite, refaite à l'aveugle à chaque prompt | **Explicite et stable** : critères clés déclarés par environnement |
| **Contenu** du contexte | Snapshot **gelé** à l'import, resync manuelle | **Frais** : sources versionnées, code mis à jour, données live |
| Moment où le contenu est fixé | À l'avance, à l'import | **Au moment de la requête** |
| Sélection des fragments | Choisie à l'aveugle avant la question | Choisie *par* la question |
| Données réelles du client | Aucune | Lues en direct, en lecture seule |
| Studio (no-code) | Invisible | Inventorié à la demande |
| Réaction à un changement de version / déploiement | Le contexte devient faux | La définition ne bouge pas ; le contenu se met à jour |

### 7.3 Isolation par projet / environnement

Chaque projet client a ses propres sources, son dépôt, son instance, son contexte projet.
Le contexte d'un client **ne fuit pas** vers un autre (pain point 4.7). L'exécution est
locale ; seuls les appels aux API IA transitent par internet.

### 7.4 Orientation produit — le contexte de travail *défini*

La thèse se traduit par un objectif produit : faire du contexte de travail un **objet
explicite, complet et frais**. Trois piliers :

**A. Prévisibilité et contrôle.** La définition du contexte doit être *inspectable*,
*épinglable* et *stable* d'une requête à l'autre — un « profil de contexte » par environnement.

**B. Complétude des critères.** La *checklist* du README liste les sources à configurer ;
l'orientation est d'en faire un **état mesurable** et un **garde-fou** qui signale ce qui
manque **avant** la première requête.

**C. Fraîcheur du code-documentation.** Le code source est la documentation de référence ;
l'orientation est de rendre la **péremption visible et proactive** (dépôt divergé, version
client changée).

> **En une phrase.** La cible est un contexte qui se **déclare une fois** (critères clés,
> stables) et se **maintient** (contenu frais) — à l'opposé du contexte NotebookLM, qui se
> déclare une fois puis se **périme** en silence.

---

## 8. Référence fonctionnelle — les critères projet et leurs effets

Cette section décrit, **fonctionnellement**, ce qui constitue le contexte d'une requête et
comment il se modifie. Pas d'architecture de code : uniquement le comportement observable.

### 8.1 Le principe — un contexte recomposé à chaque requête

Là où NotebookLM assemble le contexte **une fois**, l'application le **recompose à chaque
question**. Concrètement, avant de répondre, l'assistant rassemble :

1. **L'environnement actif** — quelle version d'Odoo, quelle base, quelle société, quel
   dépôt de code. C'est la *définition* du contexte de travail.
2. **Le contenu frais** — le code source de la bonne version, le code custom à jour, et la
   possibilité d'interroger la base en direct.
3. **Les guides pertinents** — la documentation méthodologique utile *à cette question*
   précise (voir §8.4).
4. **Le profil de réponse et le mode** — qui orientent la forme et la méthode (voir §9).

```
   Question du consultant
            │
            ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  RECOMPOSITION DU CONTEXTE  (refaite à chaque question)        │
   │                                                                │
   │   Environnement actif ──► version · édition · société · dépôt  │
   │   Contenu frais ────────► code source · code custom · live     │
   │   Guides pertinents ────► sélectionnés selon la question posée │
   │   Profil + mode ────────► forme et méthode de la réponse       │
   └──────────────────────────────────────────────────────────────┘
            │
            ▼
   Réponse vérifiée contre l'état courant du projet
```

Le résultat : deux fois la même question, posée à deux semaines d'intervalle sur un projet
qui a entre-temps été mis à jour, donne **deux réponses alignées sur la réalité du moment** —
sans aucune réimportation manuelle.

### 8.2 Les critères de modification du contexte

Voici les critères qui composent et font évoluer le contexte. La colonne **Nature** relie
chaque critère à la thèse (§1, §7.2) : *Définition* = déclaré une fois, stable et
reproductible ; *Contenu* = reconstitué frais à chaque requête ; *Déf. + contenu* = la cible
est déclarée, mais son contenu est tenu à jour.

| Critère de contexte | Nature | Comment il évolue en mission | Influence sur la requête | Pourquoi des réponses plus performantes |
|---|---|---|---|---|
| **Version Odoo** | Définition | Migration, montée de patch ; varie d'un client à l'autre | L'IA lit le code de **la** version, pas une moyenne | Noms de champs et signatures **exacts** ; fin des hallucinations inter-versions (4.1) |
| **Édition Community / Enterprise** | Définition | Souscription Enterprise ; périmètre fonctionnel différent | L'IA cherche dans la bonne édition (compta, abonnements…) | Réponses justes sur les domaines Enterprise au lieu d'être « à côté » |
| **Dépôt custom du client** | Déf. + contenu | Nouveaux modules déployés, branche de prod qui avance | L'IA lit le **vrai** code custom : héritages, overrides, champs ajoutés | Voit la réalité spécifique du projet, invisible pour tout LLM (4.2) |
| **Données live de l'instance** | Contenu | Évoluent en continu (transactions, config) | L'IA lit de vraies valeurs, compte, vérifie la config | Réponses chiffrées et factuelles, sans aller-retour manuel (4.3) |
| **Personnalisations Studio** | Contenu | Créées/modifiées en cours de projet, hors code | L'IA inventorie modèles/champs/automatisations no-code | Couvre une couche que ni le code ni un import statique ne montrent (4.4) |
| **Contexte projet (notes libres)** | Définition | S'enrichit au fil de la mission | Oriente la réponse vers les règles métier non déductibles du code | Évite des recherches inutiles ; aligne la réponse sur la réalité métier |
| **Société active** | Définition | Le client a plusieurs sociétés ; on en analyse une | Filtre les données et la configuration sur la bonne société | Pas de mélange de chiffres entre entités juridiques |
| **Guides de contexte** (documentation méthodo) | Définition | Édités selon les besoins du projet | Charge uniquement les guides pertinents (voir §8.4) | Contexte ciblé et compact → meilleure précision |
| **Profil de réponse** (perspective) | Définition | Change selon l'interlocuteur de la réponse | Réoriente vocabulaire, priorités et format (voir §9) | La réponse parle à son destinataire réel |
| **Mode de travail** (Assistant / Migration / Creator) | Définition | Change selon la tâche du jour | Réoriente la méthode et les sources mobilisées (voir §9.3) | Le même projet est abordé avec la bonne méthode |
| **Profil consultant** | Définition | Renseigné une fois, ajustable | Adapte le niveau et le format au consultant | Réponses calibrées pour l'utilisateur |
| **Modèle / fournisseur IA** | Définition | Choisi selon coût / qualité / disponibilité | Change le moteur de raisonnement | Arbitrage coût/qualité sans changer le contexte fourni |
| **Périmètre projet / environnement** | Définition | Multi-clients en parallèle | Borne strictement les sources mobilisables | Pas de pollution inter-clients ; confidentialité (4.7) |

**Lecture du tableau.** La colonne *Nature* met la thèse en évidence : la **grande majorité
des critères relèvent de la *définition*** — déclarée une fois, stable — tandis que seuls les
**données live**, **Studio** et le **contenu du dépôt custom** relèvent du *contenu*,
reconstitué frais à chaque requête. **Une définition large et stable, un contenu mince et
toujours à jour.**

### 8.3 Le contexte projet — le champ qui porte le métier

Parmi ces critères, le **contexte projet** mérite un focus : c'est la pièce « gestion de
contexte projet » au sens strict.

- **Ce que c'est** : un champ de texte libre, propre à chaque projet client, où le consultant
  consigne ce que l'IA **ne peut pas déduire du code ni des données** — règles métier,
  pièges connus, écarts entre environnements, choix de paramétrage.
- **Comment il agit** : il est fourni à l'assistant pour **chaque** question de ce projet. Un
  bon contexte projet oriente directement la réponse vers la réalité du client et évite des
  recherches inutiles.
- **Aide au remplissage** : une **auto-complétion** génère un brouillon à partir des données
  du projet (version, modules installés, société, modules custom détectés). Ce brouillon
  distingue les **faits observés**, les **hypothèses**, les **périmètres prioritaires**, les
  **risques** et les **questions ouvertes**. C'est un point de départ, à enrichir à la main.
- **Bonne pratique** : le garder **structuré et factuel**. Un contexte projet trop long ou
  bavard est contre-productif — il dispose d'un budget dédié et le superflu est écarté.

Exemple de contexte projet utile (extrait) :

```
Client : Acme SA — Distribution industrielle, ~80 utilisateurs · Odoo 16.0 Enterprise
Modules custom actifs :
- acme_sale : override du calcul de remise (logique en cascade par famille produit)
- acme_stock : règles de réservation personnalisées (priorité Gold/Silver)
Points d'attention :
- Les remises ne passent PAS par les listes de prix, elles sont calculées dans acme_sale.
- L'environnement staging est une copie de prod de janvier — données récentes absentes.
```

### 8.4 Le routage des guides de contexte

L'application dispose d'une bibliothèque de **guides méthodologiques** (documents éditables).
Plutôt que de tout envoyer à l'IA à chaque question — ce qui noie le signal et dégrade la
précision — elle **sélectionne les guides pertinents** selon la question posée.

| Guide | Rôle | Se charge quand… |
|---|---|---|
| Savoir-faire Odoo transverse | Bonnes pratiques générales, modèles essentiels | Toujours (par sections utiles) |
| Guide de rôle | Cadrage selon le profil de réponse actif | Selon le profil (§9) |
| Guide de compte-rendu | Trame de compte-rendu de réunion | La question parle de réunion / compte-rendu |
| Guide Studio | Interprétation des audits Studio | La question parle de Studio, champ custom, personnalisation |
| Notes de version | Nouveautés et changements d'une version | Question sensible à la version (migration, breaking change, « nouveautés ») |
| Guide de migration | Méthodologie de migration | Le mode Migration est actif |
| Guide de création | Conventions de création Studio | Le mode Creator est actif |

**Principe fonctionnel clé :** le contexte injecté est **borné**. Plutôt que de viser le plus
gros volume de documentation possible, l'application vise le **plus petit ensemble à fort
signal** — parce que la précision d'un assistant IA *se dégrade* quand on le noie sous trop
d'informations. Un contexte ciblé donne de meilleures réponses qu'un contexte exhaustif.

### 8.5 Exemples — comment un critère modifie concrètement la réponse

Pour rendre tangible l'effet de chaque critère, voici la **même nature de question** traitée
*sans* le critère (ce que produit un outil de prompting standard) puis *avec* (ce que produit
l'application).

| Critère en jeu | Question type | Réponse **sans** le critère | Réponse **avec** le critère |
|---|---|---|---|
| **Version Odoo** | « Quel champ porte le total HT d'une commande ? » | Un nom *plausible en moyenne*, sans garantie de version (`amount_untaxed` ou `amount_subtotal`…) | Le nom réel, lu dans le code de la version exacte du client, avec le modèle où il figure |
| **Dépôt custom** | « Pourquoi la remise affichée ne suit pas la liste de prix ? » | Une explication du fonctionnement *standard* des listes de prix — hors-sujet pour ce client | L'assistant trouve le module custom qui surcharge le calcul de remise et explique la *vraie* logique |
| **Données live** | « Combien de commandes sont en brouillon depuis plus de 30 jours ? » | Aucune réponse chiffrée possible — au mieux, « voici comment le vérifier » | Le compte réel, obtenu en interrogeant l'instance |
| **Studio** | « Quels champs ont été ajoutés sur la fiche client ? » | La liste des champs *standard* — les ajouts no-code sont ignorés | L'inventaire des champs Studio réellement créés sur l'instance |
| **Société active** | « Quel est le chiffre d'affaires de l'année ? » | Un total qui agrège *toutes* les entités — faux si le groupe a plusieurs sociétés | Le calcul borné sur la bonne entité juridique |
| **Contexte projet** | « Comment sont gérées les priorités d'expédition ? » | Une réponse générique sur le module Stock | L'assistant sait, par le contexte projet, que la priorité passe par un champ dédié — et répond juste du premier coup |

Lecture : dans chaque ligne, ce n'est pas le *modèle IA* qui change — c'est le **critère de
contexte** disponible. La performance d'une réponse vient de la disponibilité du bon critère
au bon moment, pas de la puissance brute du moteur.

---

## 9. Référence fonctionnelle — les profils de réponse et les modes de travail

Un même projet, une même question peuvent appeler des réponses **différentes** selon *à qui*
elles s'adressent et *dans quel cadre*. C'est le rôle des **profils de réponse** et des
**modes de travail**.

### 9.1 Quatre profils pour un même projet

Le **profil de réponse** (aussi appelé *perspective*) est le point de vue sous lequel
l'assistant formule sa réponse. Il modifie le **vocabulaire**, les **priorités**, ce que la
réponse **développe ou évite**, et son **format**. Il n'ajoute pas d'information nouvelle au
contexte : il **oriente** la même vérité vers le bon destinataire.

Le profil peut être **choisi explicitement** par le consultant, ou **déduit automatiquement**
de la question (un « comment débloquer l'utilisateur » bascule vers Support ; un « quel est
le risque de performance » vers Architecte). Quatre profils existent.

### 9.2 Détail des quatre profils de réponse

| Profil | Pour qui | Privilégie | Évite | Format de réponse |
|---|---|---|---|---|
| **Support** *(Run / Incident)* | Key users bloqués, support N1/N2, oncall | Diagnostic rapide (symptômes → hypothèses → vérifications), workaround temporaire, reproduction, impact | Les analyses théoriques | *Diagnostic probable* → *Vérifications à faire* → *Workaround* → *Correction durable* → *Prochaines actions* |
| **Business Analyst / AM** | Consultants fonctionnels, key users, sponsors métier, chefs de projet | Parcours utilisateur (qui clique où), processus métier de bout en bout, configuration fonctionnelle, impact rôles & KPI | Le code, le jargon framework, les snippets techniques | Tableaux métier (`Cas d'usage \| Avant \| Après \| Bénéfice \| Effort`), chemins de navigation, *3 prochaines actions* |
| **Architecte** | Architectes, tech leads, CTO, sponsors techniques | Décisions et arbitrages (standard vs custom, Community vs Enterprise), risques (sécurité, performance, dette), patterns, stratégie de migration/intégration | Le tutoriel pas-à-pas | *Décision recommandée* en tête + alternatives écartées, tableau `Option \| Pro \| Con \| Risque \| Effort`, schémas |
| **Développeur** | Développeurs, intégrateurs, tech leads | Modèles, champs, méthodes, héritage, vues, performance, impact sur les modules custom, **preuves vérifiables** (fichier, ligne, modèle) | — (profil le plus technique) | Tableaux techniques, extraits de code avec chemins, vocabulaire framework, *3 prochaines actions* |

**Ce que ça change concrètement.** La même question — *« Comment fonctionne la remise sur les
commandes ? »* — donnera :
- en profil **BA** : le parcours utilisateur, l'écran de configuration, l'effet sur le prix
  affiché, sans une ligne de code ;
- en profil **Développeur** : le modèle et le champ concernés, la méthode de calcul, l'endroit
  où le module custom surcharge le standard, avec extraits de code ;
- en profil **Architecte** : faut-il garder cette personnalisation, son risque de
  maintenance, l'alternative standard ;
- en profil **Support** : si la remise est *fausse* sur une commande, comment diagnostiquer
  et débloquer l'utilisateur.

### 9.3 Les modes de travail

Le **mode** est le cadre de la session. Là où le profil change la *forme* de la réponse, le
mode change la *méthode* et les *sources* mobilisées.

| Mode | Objet | Ce qu'il change dans le contexte |
|---|---|---|
| **Assistant** | Questions / réponses sur un projet | Mode par défaut : sources de la version courante, dépôt custom, données live, guides routés selon la question. |
| **Migration** | Comparer une version source et une version cible | Ajoute les sources de la **version cible** ; charge le guide de migration et les notes de version ; impose une méthode de comparaison (source → cible → impact) et le signalement des *breaking changes*. |
| **Creator** | Préparer des modifications de type Studio | Charge le guide de création ; cadre l'IA pour produire des modifications validées étape par étape, avec garde-fous (rien n'est appliqué sans validation). |

### 9.4 Profil × mode — comment ils se combinent

Profil et mode se combinent. En **mode Migration**, chaque profil reçoit en plus un cadrage
spécifique :

| Profil en mode Migration | Ce que la réponse met en avant |
|---|---|
| **Business Analyst** | Nouvelles fonctionnalités du standard cible, modules à activer/remplacer, changements UX visibles, **impact formation** (faible/moyen/fort) |
| **Support** | Erreurs récurrentes post-migration et leurs workarounds, modules tiers susceptibles de casser, vérifications de fumée prioritaires |
| **Architecte** | Stratégie d'ordonnancement (natif → OCA → custom), risques de rupture d'API, décision Community vs Enterprise |
| **Développeur** | Liste des *breaking changes*, méthodes/champs renommés ou supprimés, scripts de migration et tests de non-régression |

C'est la combinaison **critères projet (§8) × profil × mode** qui produit une réponse
*performante* : non pas « plausible », mais **vérifiée contre l'état courant du projet** et
**formulée pour son destinataire réel**.

### 9.5 Exemples supplémentaires — la même question selon le profil

Tous les profils ne sont pas pertinents pour *toute* question : chaque question a un **profil
naturel**, que l'assistant déduit de la formulation et que le consultant peut forcer. Deux
exemples au-delà de celui de §9.2.

**Exemple A — « Faut-il gérer cette nouvelle règle de remise via Studio ou via un module
custom ? »** *(profil naturel : Architecte — c'est une décision)*

| Profil activé | Ce que la réponse met en avant |
|---|---|
| **Architecte** | Décision argumentée : Studio = rapide mais limité et fragile en migration ; module custom = robuste mais coûteux. Recommandation + alternatives écartées et raison. |
| **Développeur** | Faisabilité technique de chaque option, impact sur les vues, sur les modules custom existants et sur la prochaine migration. |
| **Business Analyst** | Ce que chaque option change pour l'utilisateur final, le délai de mise à disposition, l'effort de formation. |
| **Support** | Peu pertinent — l'assistant le signale et recadre vers le profil adapté. |

**Exemple B — « Une facture affiche un montant de taxe incohérent. »** *(profil naturel :
Support — c'est un incident)*

| Profil activé | Ce que la réponse met en avant |
|---|---|
| **Support** | Diagnostic ordonné : position fiscale ? taux de taxe sur la ligne ? arrondi ? → vérifications concrètes, workaround, puis correction durable. |
| **Développeur** | Où le calcul de taxe est effectué, ce qui peut produire l'écart, preuve vérifiable dans le code. |
| **Business Analyst** | Le processus de taxation standard et le paramétrage qui le pilote, pour situer l'anomalie côté configuration. |
| **Architecte** | Peu pertinent pour un incident ponctuel — sauf si l'anomalie révèle un défaut de conception. |

Le profil ne crée pas d'information : il **oriente la même vérité** vérifiée vers le bon
destinataire, avec le bon vocabulaire et le bon format.

---

## 10. Tableau comparatif récapitulatif

| Capacité | ChatGPT (chat) | Gemini (chat) | NotebookLM | Better Odoo Assistant |
|---|---|---|---|---|
| Ancrage sur sources fournies | Partiel (fichiers) | Partiel (fichiers) | **Oui** (RAG + citations) | **Oui** (lecture vérifiée + traçabilité) |
| Version Odoo exacte | Non | Non | Selon import | **Oui** (sélection + sources versionnées) |
| Code custom du client | Non | Non | Si importé, **figé** | **Oui** (dépôt cloné et mis à jour) |
| Données live de l'instance | Non | Non | Non | **Oui** (lecture seule) |
| Personnalisations Studio | Non | Non | Non | **Oui** (inventaire à la demande) |
| Fraîcheur du contexte | Manuelle | Manuelle | **Snapshot gelé**, resync manuelle | **À la requête** |
| Sélection des fragments | À l'aveugle | À l'aveugle | À l'import | **Par la question** |
| Profils de réponse adaptés | Non (à reformuler) | Non | Non | **Oui** (Support / BA / Architecte / Dév.) |
| Modes de travail dédiés | Non | Non | Non | **Oui** (Assistant / Migration / Creator) |
| Isolation par client | Non | Non | Par notebook (manuel) | **Oui** (par projet / environnement) |
| Traçabilité « lu vs supposé » | Non | Non | Citations | **Oui** (vérification explicite + alertes) |
| Exécution locale | Non | Non | Non | **Oui** (seuls les appels API IA sortent) |

---

## 11. Limites et points ouverts (honnêteté du document)

- L'application **dépend de la configuration** : si une source n'est pas téléchargée /
  clonée / à jour, la qualité chute. L'assistant le signale, mais l'effort de configuration
  existe (voir la *checklist* du README).
- L'accès **live** suppose une connexion à l'instance avec les droits adéquats.
- La fraîcheur reste aujourd'hui **partiellement manuelle** (mise à jour déclenchée par
  l'utilisateur) — c'est précisément l'objet du pilier C de l'orientation produit (§7.4).
- NotebookLM reste **meilleur** sur son usage de conception : synthèse d'un corpus
  documentaire stable, génération de résumés / audio. Ce document compare un usage précis —
  **requêter un Odoo de mission, vivant**.
- Les plafonds et le comportement de synchronisation de NotebookLM cités ici reflètent
  l'état connu en **mai 2026** et peuvent évoluer.

---

## 12. Questions ouvertes pour la suite

Le document est complet pour son objet — référence fonctionnelle des modifications de
contexte. Restent quelques **enrichissements optionnels, non bloquants** :

- **Captures d'écran réelles** de la barre de contexte et des écrans de sélection
  profil/mode, en complément des schémas fonctionnels (§7.2, §8.1).
- **Chiffrage mesuré** (temps gagné par requête, taux d'hallucination observé) : il
  nécessiterait une campagne de mesure dédiée. Tant que ces données n'existent pas, le
  document reste **volontairement qualitatif** — aucun chiffre n'est inventé.
- **Étude de cas narrative** déroulée de bout en bout (ex. migration 16.0 → 17.0) si un
  format plus illustratif que les exemples des §8.5 et §9.5 est souhaité ultérieurement.

---

### Annexe — sources consultées sur NotebookLM (mai 2026)

- NotebookLM Help — *Frequently asked questions* / *Add or discover new sources*
  (support.google.com/notebooklm)
- Synthèses tierces sur les plafonds de sources (50 / 300 / 600) et la taille par source
  (~500 000 mots ou 200 Mo).
- Articles sur la **synchronisation des sources** : snapshot à l'import, resync manuelle
  limitée aux sources Google Drive, absence d'« Update All ».

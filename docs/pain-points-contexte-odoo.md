# Pain points du consultant Odoo face aux outils de prompting — et la réponse de Better Odoo Assistant

> **Statut : première ébauche (à itérer).** Document de cadrage interne.
> Objet : justifier le moteur de contexte de l'application en partant du problème réel
> vécu par un consultant Odoo, et le situer face aux outils de prompting du marché
> (NotebookLM, ChatGPT, Gemini).
>
> Document lié : `README.md` → section *« Qualité des réponses IA — Sources & contexte »*,
> qui décrit l'implémentation. Le présent document décrit le **problème** et le **pourquoi**.

---

## 1. Objet du document

Un consultant Odoo passe une grande partie de son temps à **poser des questions sur un
système** : où est défini ce champ ? que fait cette méthode ? ce comportement vient-il du
standard ou d'un module custom ? quelle valeur a réellement cet enregistrement en base ?

Les assistants IA généralistes (ChatGPT, Gemini) ou semi-spécialisés (NotebookLM) promettent
de répondre à ces questions. En pratique, ils échouent de façon **systématique et prévisible**
sur le travail Odoo réel. Ce document :

1. identifie les *pain points* — pourquoi requêter Odoo via les outils de prompting standards
   ne marche pas ;
2. analyse en détail **NotebookLM**, le candidat le plus crédible, et sa limite structurelle :
   le **contexte gelé** ;
3. explique en quoi l'approche de Better Odoo Assistant — un **contexte vivant** — répond à ce
   problème ;
4. formalise, sous forme de tableau, les **critères de modification du contexte**, leur
   influence sur la requête, et pourquoi ils produisent des réponses plus performantes.

> **Thèse du document.** Le bon contexte de travail n'est ni *figé* ni *flou*. Il est à la
> fois **défini** — un périmètre explicite, stable et reproductible sur des **critères
> clés** — et **vivant** — alimenté par un code source servant de « documentation » de
> référence, **tenu à jour**. NotebookLM confond les deux : en *définissant* le contexte
> une fois, il en *gèle* aussi le contenu. Tout l'enjeu est de **séparer la *définition* du
> contexte (stable, contrôlée, vérifiable) de son *contenu* (frais, reconstitué à l'état
> courant)**. C'est le fil conducteur des sections 6 et 7.

---

## 2. Le travail réel du consultant Odoo

Pour comprendre les pain points, il faut comprendre ce qui rend une mission Odoo
particulière du point de vue de l'information :

| Caractéristique du terrain | Conséquence pour un assistant IA |
|---|---|
| **Plusieurs versions coexistent** — un consultant jongle entre des clients en 14.0, 16.0, 17.0, 18.0… | Une réponse correcte pour une version est fausse pour une autre. La « bonne réponse » dépend du client. |
| **Community ≠ Enterprise** — la compta, les abonnements, la signature, le MRP avancé… vivent dans `enterprise`. | Un modèle entraîné « en moyenne » mélange les deux éditions. |
| **Chaque client a du code custom** — modules spécifiques, héritages (`_inherit`), overrides. | Ce code n'existe **nulle part** dans les données d'entraînement d'un LLM. Il est, par construction, inconnu. |
| **Le no-code (Studio) ajoute une couche invisible** — modèles `x_`, champs custom, automatisations, vues modifiées. | Ces personnalisations ne sont pas dans le dépôt Git ; elles vivent **dans la base de données**. |
| **La mission dure dans le temps** — la version est mise à jour, des modules sont déployés, les données évoluent chaque jour. | Tout contexte figuré à un instant T devient progressivement faux. |
| **Confidentialité** — le code et les données d'un client ne doivent pas fuiter vers un autre, ni vers un tiers. | L'isolation par projet n'est pas un confort, c'est une exigence. |

Autrement dit : la « vérité » dont le consultant a besoin est **spécifique, distribuée sur
plusieurs sources, et mouvante**. C'est exactement le profil de problème que les outils de
prompting standards gèrent mal.

---

## 3. Pain points — requêter Odoo avec les outils de prompting standards

### 3.1 Le modèle ne connaît pas *la* version exacte du client

Un LLM connaît Odoo « en général », à partir d'un corpus qui mélange plusieurs versions,
des forums, des tutoriels parfois datés. Quand on lui demande le nom d'un champ, il produit
une réponse **plausible en moyenne** — par exemple `amount_subtotal` au lieu de
`amount_untaxed` — sans pouvoir dire à quelle version elle correspond.

- Pas de notion de « version active ». Le consultant doit la préciser à chaque question, et
  rien ne garantit que le modèle en tienne réellement compte.
- Les renommages, déplacements de champs et changements de signature entre versions sont
  précisément les cas où le consultant a besoin d'aide — et précisément ceux où le modèle
  hallucine.
- **Conséquence :** réponses qui « semblent justes », coûteuses à vérifier, dangereuses si
  appliquées telles quelles.

### 3.2 Le code custom du client est invisible

Les modules développés pour un client ne sont dans aucun corpus d'entraînement. Un assistant
généraliste ne peut pas :

- savoir qu'un modèle standard a été étendu (`_inherit`) ;
- voir un champ ajouté par un module custom ;
- lire un override qui change le comportement d'une méthode standard.

Or **c'est là que se trouve la complexité d'un projet en production**. Le pain point n'est
pas « l'IA répond mal », c'est « l'IA répond sur un Odoo qui n'est pas celui du client ».

### 3.3 Les données réelles de l'instance sont inaccessibles

Beaucoup de questions de mission sont des questions de **données**, pas de code :
combien de commandes en brouillon ? quels journaux comptables sont configurés ? telle
société utilise-t-elle telle fonctionnalité ? Un chat web n'a aucun accès à la base du
client. Le consultant doit aller chercher la valeur lui-même, puis la recoller dans le
prompt — ce qui annule l'intérêt de poser la question.

### 3.4 Les personnalisations no-code (Studio) échappent au modèle

Studio permet de créer modèles, champs, vues, automatisations **sans écrire de code et sans
commit Git**. Ces personnalisations n'existent ni dans l'entraînement, ni dans un dépôt
qu'on pourrait fournir : elles vivent dans des tables techniques de la base
(`ir.model`, `ir.model.fields`, `base.automation`, `ir.cron`…). Aucun outil de prompting
standard ne peut les inventorier.

### 3.5 Le contexte bouge pendant la mission — le pain point central

Même si, au prix d'un gros effort, le consultant réunissait toutes les sources le jour 1,
le problème reviendrait : **le terrain change**.

- La version d'Odoo est mise à jour (migration, montée de patch).
- De nouveaux modules custom sont déployés ; la branche de production avance.
- Les données évoluent en continu.
- De nouvelles personnalisations Studio sont créées.
- La compréhension du projet s'affine — on découvre des règles métier en cours de route.

Un contexte assemblé manuellement est **vrai à un instant T et faux ensuite**. Le maintenir
à jour à la main est un travail récurrent que personne ne fait — donc l'outil dérive
silencieusement vers des réponses obsolètes. Ce point est développé pour NotebookLM en
section 4.

### 3.6 Le copier-coller manuel ne passe pas à l'échelle

L'« astuce » classique — coller le code dans le chat — échoue sur du vrai Odoo :

- le code source d'Odoo (Community + Enterprise) représente des **milliers de fichiers** et
  des millions de lignes ; impossible à coller ;
- la fenêtre de contexte est limitée — on ne peut coller qu'un fragment, choisi *avant* de
  savoir lequel est pertinent ;
- pas de **navigation** : l'IA ne peut pas suivre un héritage, ouvrir le fichier voisin,
  faire un `grep` ;
- ce n'est **pas reproductible** : chaque question repart de zéro, le consultant recolle.

### 3.7 Pas d'isolation par client

Dans un chat web, tous les échanges vivent dans le même espace. Mélanger le code et les
données de plusieurs clients dans une même conversation crée un risque de **pollution de
contexte** (l'IA répond avec la réalité d'un autre client) et un risque de
**confidentialité** (le code d'un client transite et se mélange).

### 3.8 Aucune traçabilité : « savoir » vs « inventer »

Un assistant généraliste ne distingue pas, dans sa réponse, ce qu'il a *lu* d'une source
fiable de ce qu'il *suppose*. Le consultant ne peut pas faire la différence sans tout
revérifier — ce qui détruit le gain de temps recherché.

### Synthèse des pain points

| # | Pain point | Conséquence concrète en mission |
|---|---|---|
| 3.1 | Version exacte inconnue du modèle | Noms de champs / méthodes hallucinés, faux pour le client |
| 3.2 | Code custom invisible | L'IA ignore héritages, overrides, champs custom |
| 3.3 | Données live inaccessibles | Toute question « chiffre / config » oblige à un aller-retour manuel |
| 3.4 | Studio invisible | Personnalisations no-code totalement absentes des réponses |
| 3.5 | Le contexte change dans le temps | Réponses progressivement obsolètes ; entretien manuel jamais fait |
| 3.6 | Copier-coller non scalable | Fragments partiels, pas de navigation, rien de reproductible |
| 3.7 | Pas d'isolation par client | Pollution de contexte + risque de confidentialité |
| 3.8 | Pas de traçabilité | Impossible de distinguer réponse vérifiée et supposition |

---

## 4. Focus : NotebookLM (Gemini) — un bon outil, mais un contexte gelé

NotebookLM est le candidat le plus sérieux : contrairement à un chat généraliste, il
**ancre** ses réponses dans des sources que l'utilisateur fournit. C'est la bonne intuition.
Mais son architecture le rend inadapté à une mission Odoo qui dure.

### 4.1 Ce que fait NotebookLM

NotebookLM est un outil de **RAG sur sources fournies** : on crée un *notebook*, on y ajoute
des sources (PDF, Google Docs / Sheets / Slides, pages web, YouTube, audio, images, texte
collé — et donc, indirectement, du code source sous forme de fichiers), puis on pose des
questions. L'outil répond **uniquement** à partir de ces sources et cite ses passages.

### 4.2 Ses points forts pour un consultant

- Réponses **ancrées** dans le matériel fourni, avec citations → moins d'hallucination que
  ChatGPT/Gemini en chat libre.
- On *peut* y mettre du code source et de la documentation projet.
- Bon pour **synthétiser un corpus stable** : un cahier des charges, une doc fonctionnelle
  figée, des comptes rendus.

### 4.3 La limite structurelle : le contexte est **statique**

C'est le cœur du problème, et il rejoint directement le pain point 3.5.

- **NotebookLM stocke un instantané (snapshot) de chaque source au moment de l'import.**
  Il n'y a **pas de mise à jour automatique**.
- La détection de fraîcheur (« Click to sync with Google Drive ») ne fonctionne **que pour
  les sources Google Drive** (Docs, Sheets, Slides, PDF dans Drive). Les **pages web et les
  fichiers uploadés localement ne sont pas surveillés** : il faut les **réimporter à la
  main**.
- Il n'existe **pas de bouton « tout mettre à jour »** : chaque source se resynchronise
  individuellement.

Conséquence pour une mission Odoo : on **définit le contexte à l'avance**, et il est **gelé**.
Dès que la version d'Odoo monte, qu'un module custom est déployé, qu'une personnalisation
Studio est créée ou que les données évoluent, le notebook répond sur une **réalité passée**.
Le maintenir à jour suppose un travail manuel récurrent (réimport source par source) que
personne ne tient sur la durée. Le notebook **dérive silencieusement**.

### 4.4 Les plafonds de sources face au volume d'Odoo

| Plan NotebookLM | Sources / notebook | Par source |
|---|---|---|
| Gratuit | 50 | jusqu'à ~500 000 mots ou 200 Mo (upload local) |
| Plus | 300 | idem |
| Ultra | 600 | idem |

Le code source d'Odoo (Community **+** Enterprise) compte des **milliers de fichiers**.
Même en agrégeant, on se heurte au plafond de sources et au plafond de mots par source. On
finit par n'importer qu'un **sous-ensemble** — choisi à l'avance, donc avant de savoir ce
qui sera utile. C'est le pain point 3.6 transposé.

### 4.5 L'absence d'outils : pas de live, pas de `grep`, pas de Studio

NotebookLM **lit** des sources ; il **n'exécute pas d'outils**. Il ne peut donc pas :

- interroger la base du client en direct (XML-RPC) → **aucun accès aux données live** ;
- faire un `grep` / une recherche ciblée *à la demande* dans le code → la sélection des
  fragments reste figée à l'import ;
- inventorier les personnalisations **Studio** (qui sont dans la base, pas dans un fichier).

### 4.6 Conclusion sur NotebookLM

NotebookLM résout **3.2** partiellement (si on importe le code) et **3.8** (citations), mais
**ne résout pas 3.1, 3.3, 3.4, 3.6, 3.7**, et **échoue précisément sur 3.5** — le pain point
central. Bon pour un corpus stable ; **inadapté à une mission Odoo vivante**.

---

## 5. ChatGPT / Gemini (chat web) — même limite, sans même l'ancrage

Les chats généralistes n'ont même pas l'ancrage de NotebookLM :

- **ChatGPT** : connaissance « moyenne » d'Odoo, pas de notion de version active, contexte
  réinjecté à la main à chaque session, pas d'accès au code custom ni au live. Les
  fonctions de fichiers/projets aident, mais restent un **import manuel et statique**, sans
  navigation de code ni accès base.
- **Gemini** : même profil. Grande fenêtre de contexte, mais cela ne change rien : on ne
  peut pas y *coller* un Odoo complet, et ce qu'on colle est figé et choisi à l'aveugle.

Pour les deux : aucune isolation propre par client, aucune fraîcheur garantie, aucune
traçabilité « lu vs supposé ».

---

## 6. La réponse de Better Odoo Assistant — un **contexte vivant**

### 6.1 Principe : l'IA *lit*, elle ne *devine* pas

L'assistant ne s'appuie pas sur la connaissance « moyenne » du modèle. Il dispose **d'outils**
pour aller chercher la vérité au moment de la question :

- `grep` / lecture de fichiers dans les **sources Odoo** de la version exacte du client ;
- `grep` / lecture dans le **dépôt custom** du client (cloné localement) ;
- requêtes **XML-RPC en lecture seule** sur l'instance pour les données et la config ;
- outil `inspect_studio` pour inventorier les personnalisations no-code ;
- un **routeur de contexte** qui sélectionne les fichiers Markdown pertinents par question.

L'IA « ne sait plus » — elle **vérifie**, comme le ferait le consultant dans un terminal.

### 6.2 Définition *stable*, contenu *vivant* — le point clé

La différence fondamentale avec NotebookLM ne tient pas à « statique vs dynamique » au sens
flou. Elle tient à une **séparation** que NotebookLM ne fait pas :

- la **définition** du contexte — *quels* critères clés entrent en jeu (version, édition,
  dépôt, instance, contexte projet, fichiers de guidage) — doit être **explicite, stable et
  reproductible** ;
- le **contenu** de ce contexte — le code source, les données, l'inventaire Studio — doit
  être **reconstitué à l'état courant** à chaque requête.

NotebookLM fige les deux d'un coup. L'application fige la **définition** et garde le
**contenu** vivant :

| | NotebookLM / ChatGPT / Gemini | Better Odoo Assistant |
|---|---|---|
| **Définition** du contexte | Implicite, refaite à l'aveugle à chaque prompt | **Explicite et stable** : critères clés déclarés par environnement |
| **Contenu** du contexte | Snapshot **gelé** à l'import, resync manuelle | **Frais** : sources versionnées, `git pull`, live XML-RPC |
| Moment où le contenu est fixé | À l'avance, à l'import | **Au moment de la requête**, par appels d'outils |
| Sélection des fragments | Choisie à l'aveugle avant la question | Choisie *par* la question (grep ciblé, routeur) |
| Données réelles du client | Aucune | Lues en direct, en lecture seule |
| Studio (no-code) | Invisible | Inventorié à la demande |
| Réaction à un changement de version / déploiement | Le notebook devient faux | La définition ne bouge pas ; le contenu se met à jour (version / `pull`) |

Là où NotebookLM **gèle** définition *et* contenu, l'application **garde une définition
nette** et **reconstruit le contenu à chaque requête** à partir de l'état courant du projet.
Un changement de terrain n'invalide pas l'outil : la définition reste vraie, et le mécanisme
correspondant absorbe le changement (voir le tableau de la section 7).

### 6.3 Isolation par projet / environnement

Chaque projet client a ses propres sources, son dépôt, son instance, son contexte projet et
ses fichiers Markdown. Le contexte d'un client **ne fuit pas** vers un autre — ce qui répond
au pain point 3.7 (pollution et confidentialité). L'exécution est locale ; seuls les appels
aux API IA transitent par internet.

### 6.4 Orientation produit — le contexte de travail *défini*

La thèse du document (un contexte **défini et vivant**) se traduit par un objectif produit :
faire du contexte de travail un **objet explicite, complet et frais**, et non un assemblage
implicite. Trois piliers, correspondant aux trois priorités retenues.

**A. Prévisibilité et contrôle — un périmètre explicite et reproductible.**
Le consultant doit pouvoir *voir et figer* ce qui constitue le contexte d'une requête : la
définition ne doit pas être une boîte noire. La barre de contexte (provider, environnement,
badges sources / dépôt) en pose la base.
*Orientation :* rendre la définition entièrement **inspectable** (« qu'est-ce qui est
réellement entré dans cette réponse ? »), **épinglable** et **stable** d'une requête à
l'autre — un véritable « profil de contexte » par environnement, déclaré une fois.

**B. Complétude des critères — tous les critères clés renseignés et vérifiés.**
La *checklist* du README liste déjà les sources à configurer.
*Orientation :* transformer cette checklist en **état mesurable** — un indicateur de
complétude du contexte par environnement — et, idéalement, en **garde-fou** qui signale ce
qui manque (Enterprise non téléchargée, dépôt custom absent, contexte projet vide…) **avant**
la première requête, plutôt que de laisser l'IA répondre sur un contexte incomplet.

**C. Fraîcheur du code-documentation — la source comme documentation toujours à jour.**
Le code source — standard *et* custom — est la **documentation de référence** du projet ;
sa valeur dépend de sa fraîcheur. Aujourd'hui : version sélectionnable, `git pull` manuel,
badges d'état.
*Orientation :* rendre la **péremption visible et proactive** — détecter qu'un dépôt custom
a divergé de sa branche de production, qu'une version d'Odoo a changé côté client, ou qu'une
source n'a pas été rafraîchie depuis longtemps, et **le signaler avant** que la source
obsolète ne fausse une réponse.

> **En une phrase.** La cible est un contexte de travail qui se **déclare une fois** (les
> critères clés, nets et stables — piliers A et B) et se **maintient seul ou sous alerte**
> (le contenu reste frais — pilier C) — à l'opposé du contexte NotebookLM, qui se déclare
> une fois puis se **périme** en silence.

---

## 7. Tableau — Critères de modification du contexte

Ce tableau est le cœur du document. Il liste les **critères** qui font évoluer le contexte
d'une mission, **comment l'application les prend en charge**, leur **influence sur la
requête**, et **pourquoi cela produit des réponses plus performantes**.

La colonne **Nature** relie chaque critère à la thèse du document (§1, §6.2) :
*Définition* = déclaré une fois, stable et reproductible ; *Contenu* = reconstitué frais à
chaque requête ; *Déf. + contenu* = la cible (dépôt, branche) est déclarée, mais son code
est tenu à jour.

| Critère de contexte | Nature | Comment il évolue en mission | Mécanisme dans l'application | Influence sur la requête | Pourquoi des réponses plus performantes |
|---|---|---|---|---|---|
| **Version Odoo** | Définition | Migration, montée de patch ; varie d'un client à l'autre | Sélection de la version active ; sources standard téléchargeables par version | L'IA `grep`/lit le code de **la** version, pas une moyenne | Noms de champs et signatures **exacts** ; fin des hallucinations inter-versions (3.1) |
| **Édition Community / Enterprise** | Définition | Souscription Enterprise ; périmètre fonctionnel différent | Sources Community **et** Enterprise téléchargeables séparément | L'IA cherche dans la bonne édition (compta, abonnements…) | Réponses justes sur les domaines Enterprise au lieu d'être « à côté » |
| **Dépôt custom du client** | Déf. + contenu | Nouveaux modules déployés, branche de prod qui avance | `git clone` + **`git pull`** ; badge ✓ ⎇ ; pointage sur la branche de production | L'IA lit le **vrai** code custom : héritages, overrides, champs ajoutés | Voit la réalité spécifique du projet, invisible pour tout LLM (3.2) |
| **Données live de l'instance** | Contenu | Évoluent en continu (transactions, config) | Requêtes **XML-RPC en lecture seule** à la demande | L'IA lit de vraies valeurs, compte, vérifie la config | Réponses chiffrées et factuelles, sans aller-retour manuel (3.3) |
| **Personnalisations Studio** | Contenu | Créées/modifiées en cours de projet, hors Git | Outil `inspect_studio` (interroge `ir.model`, `base.automation`, `ir.cron`…) | L'IA inventorie modèles/champs/automatisations no-code | Couvre une couche que ni le code ni un import statique ne montrent (3.4) |
| **Contexte projet (notes libres)** | Définition | S'enrichit au fil de la mission | Champ texte par projet, injecté dans chaque prompt, **budget dédié**, auto-complétion ✨ | Oriente la réponse vers les règles métier non déductibles du code | Évite des appels d'outils inutiles ; aligne la réponse sur la réalité métier |
| **Fichiers Markdown de contexte** (`studio.md`, `migration.md`, `meeting-minute.md`…) | Définition | Édités selon les besoins du projet | **Routeur de contexte** : sélectionne les sections utiles selon la question | Charge uniquement les guides pertinents (compta, Studio, migration…) | Contexte ciblé et compact → moins de bruit, meilleure précision |
| **Perspective active / mode migration** | Définition | Change selon la tâche du jour | Perspective et mode migration sélectionnables ; influencent le routage | Réoriente sources et guides (ex. notes de version en migration) | Le même projet répond différemment selon l'angle de travail, à propos |
| **Profil consultant** | Définition | Renseigné une fois, ajustable | Profil (nom, poste, équipe, préférences) injecté au prompt | Adapte le niveau et le format de réponse | Réponses calibrées pour l'utilisateur, moins de reformulation |
| **Provider / modèle IA** | Définition | Choisi selon coût / qualité / disponibilité | Sélecteur de provider et de modèle | Change le moteur de raisonnement | Permet d'arbitrer coût/qualité sans changer le contexte fourni |
| **Périmètre projet / environnement** | Définition | Multi-clients en parallèle | Isolation par projet et par environnement | Borne strictement les sources mobilisables | Pas de pollution inter-clients ; confidentialité préservée (3.7) |

**Lecture du tableau.** Chaque ligne est un critère qui, dans NotebookLM ou un chat web,
**gèlerait** ou **manquerait**. Dans l'application, chacun est associé à un mécanisme qui le
**réévalue au moment de la requête**. La colonne *Nature* met la thèse en évidence : la
**grande majorité des critères relèvent de la *définition*** — déclarée une fois, stable —
tandis que seuls les **données live**, **Studio** et le **code du dépôt custom** relèvent du
*contenu*, reconstitué frais à chaque requête. Autrement dit : **une définition large et
stable, un contenu mince et toujours à jour**. C'est la somme de ces réévaluations qui
produit une réponse *performante* : non pas « plausible », mais **vérifiée contre l'état
courant du projet** — code de la bonne version, code custom à jour, données réelles,
personnalisations no-code incluses, et guides ciblés par la question.

---

## 8. Tableau comparatif récapitulatif

| Capacité | ChatGPT (chat) | Gemini (chat) | NotebookLM | Better Odoo Assistant |
|---|---|---|---|---|
| Ancrage sur sources fournies | Partiel (fichiers) | Partiel (fichiers) | **Oui** (RAG + citations) | **Oui** (lecture d'outils + traçabilité) |
| Version Odoo exacte | Non | Non | Selon import | **Oui** (sélection + sources versionnées) |
| Code custom du client | Non | Non | Si importé, **figé** | **Oui** (clone + `pull`) |
| Données live de l'instance | Non | Non | Non | **Oui** (XML-RPC lecture seule) |
| Personnalisations Studio | Non | Non | Non | **Oui** (`inspect_studio`) |
| Fraîcheur du contexte | Manuelle | Manuelle | **Snapshot gelé**, resync manuelle | **À la requête** (`pull`, live, routeur) |
| Sélection des fragments | À l'aveugle | À l'aveugle | À l'import | **Par la question** (`grep`, routeur) |
| Isolation par client | Non | Non | Par notebook (manuel) | **Oui** (par projet / environnement) |
| Traçabilité « lu vs supposé » | Non | Non | Citations | **Oui** (lecture explicite + signalement des sources absentes) |
| Exécution locale | Non | Non | Non | **Oui** (seuls les appels API IA sortent) |

---

## 9. Limites et points ouverts (honnêteté du document)

- L'application **dépend de la configuration** : si une source n'est pas téléchargée / clonée /
  à jour, la qualité chute. L'assistant le signale, mais l'effort de configuration existe
  (voir la *checklist* du README).
- L'accès **live** suppose une clé API Odoo avec les droits adéquats.
- NotebookLM reste **meilleur** sur un usage pour lequel il est conçu : synthèse d'un corpus
  documentaire stable, génération de résumés/audio. Le présent document compare un usage
  précis — **requêter un Odoo de mission, vivant** — pas l'outil dans l'absolu.
- Les plafonds et le comportement de synchronisation de NotebookLM cités ici reflètent l'état
  connu en **mai 2026** et peuvent évoluer.

---

## 10. Questions ouvertes pour la suite

Pour transformer cette ébauche en document finalisé :

1. **Captures / schémas** : intégrer des captures de la barre de contexte et des modals
   d'environnement, ou conserver les schémas ASCII du README ?
2. **Chiffrage** : ajouter un exemple chiffré (temps gagné par requête, taux d'hallucination
   observé) ? Si oui, dispose-t-on de mesures réelles ou reste-t-on qualitatif ?
3. **Étude de cas** : dérouler un cas concret de bout en bout (ex. « le client passe de 16.0
   à 17.0 » → ce qui casse dans un notebook vs ce qui se met à jour dans l'app) ?
4. **Sources NotebookLM** : faut-il citer les références web en bas de document, ou rester
   sans liens externes pour une doc interne ?
5. **Positionnement** : le document doit-il aussi servir de base à un futur argumentaire
   commercial (section 1 mentionnée comme « interne ») ?

---

### Annexe — sources consultées sur NotebookLM (mai 2026)

- NotebookLM Help — *Frequently asked questions* / *Add or discover new sources*
  (support.google.com/notebooklm)
- Synthèses tierces sur les plafonds de sources (50 / 300 / 600) et la taille par source
  (~500 000 mots ou 200 Mo).
- Articles sur la **synchronisation des sources** : snapshot à l'import, resync manuelle
  limitée aux sources Google Drive, absence d'« Update All ».

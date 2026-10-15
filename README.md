# Ma Maison

Suivi de la maison : entretien et calendrier de saison, chiffrage des travaux, énergie & charges, crédit et « opération à zéro », simulation d'achat, documents et inventaire des biens de valeur.
HTML/CSS/JavaScript purs (modules ES, sans build) + Firebase gratuit (Auth e-mail et Realtime Database), sur le même modèle que **Mon Garage**.

## Structure
```
index.html              onglets (Accueil, Entretien, Travaux, Finances, Dossier ; Travaux masquable) et feuilles de saisie
css/                    tokens, style « Ardoise » (thème auto / sombre / clair), composants, vues
js/core/                schéma des données, store (local + synchro clé par clé), calculs (échéances, travaux, crédit), rubriques affichées
js/services/            Firebase, stockage local, fichiers joints, liens avec Carnet et Mon budget
js/features/            pop-up des entretiens en retard, import du tableau d'amortissement
scripts/rappels/        envoi des notifications du matin (GitHub Actions, voir « Rappels »)
vendor/                 pdf.js et SheetJS (lecture PDF / Excel, chargés seulement à l'import)
logos/                  propositions de logo (icon.svg = logo retenu)
js/ui/                  icônes, toasts, fenêtres, graphiques
js/views/               accueil, fiche maison, entretien, travaux, projet immobilier
js/config/              configuration Firebase
database.rules.json     règles Realtime Database (chaque compte ne voit que ses données)
```

## Compte et données
- **Même projet Firebase (test-e27e9) et même compte que Mon Garage, Carnet, Allure et Mon budget** : on se connecte avec le même e-mail / mot de passe. Les données sont rangées à part, sous `users/<uid>/maison` (fichiers joints : `users/<uid>/maison_files/<id>`) — les règles existantes (`users/$uid`) les couvrent déjà, rien à republier.
- Liens avec les autres apps, écrits dans le même compte : `users/<uid>/carnet/maison_alerts` (Carnet) et `users/<uid>/budget/linked/maison` (Mon budget). Plus aucun envoi vers les anciennes bases publiques de Carnet et de Mon budget.
- Local : `localStorage`, préfixe `ma_maison_v1_` ; fonctionne hors ligne puis resynchronise.

## Onglets
Travaux, Achat et Inventaire sont des rubriques facultatives (voir « Rubriques » plus bas).
- **Accueil** : fiche de la maison, entretiens en retard / à 30 jours, charges par mois, tâches de saison du mois, garanties qui expirent, travaux à venir, valeur & crédit (valeur = votre estimation saisie dans la fiche). Au lancement, une fenêtre liste en une seule fois les entretiens en retard ; un appui sur l'un d'eux ouvre directement la saisie de l'intervention (comme Mon Garage).
- **Entretien**
  - *Plan & historique* : plan d'entretien pré-rempli selon le chauffage (obligations légales signalées), bouton « Fait », historique par année. La facture d'une intervention (photos ou PDF) se joint dans son formulaire et est rangée automatiquement dans Dossier › Documents (document « Facture » relié, étiquette « Entretien ») ; supprimer l'intervention supprime aussi sa facture.
  - *Calendrier de saison* : tâches courantes mois par mois (purge des radiateurs, gouttières, hivernage…), adaptées au chauffage et au type de logement ; à cocher chaque année, masquables, tâches perso possibles.
- **Travaux** : projets chiffrés poste par poste (HT, TVA 5,5/10/20 %, imprévus, aides) → reste à charge, épargne mensuelle à prévoir, suivi du dépensé.
- **Finances**
  - *Charges* : charges récurrentes (mensualisations, assurance, box…) et factures ponctuelles (taxe foncière, régularisations…) — pas de relevé de compteur. Total sur 12 mois glissants, graphique mensuel par catégorie, répartition.
  - *Crédit & revente* : version minimale — date de l'**opération à zéro** (voir ci-dessous), capital remboursé face aux frais perdus, puis le crédit en cours (capital restant dû, mensualité, fin). **Tableau d'amortissement** de la banque importable (PDF, Excel, CSV ou texte collé : colonnes détectées, échéances déjà payées reconstituées), sinon calcul depuis la fiche.
  - *Achat* : simulations d'achat comparables (notaire, apport dont revente de la maison actuelle, mensualité, endettement 35 %, capacité d'emprunt, reste à vivre).
- **Dossier**
  - *Documents* : acte, factures, garanties, diagnostics… avec photos et PDF (10 par document, 4 Mo par PDF), date de fin de garantie signalée à l'approche.
  - *Inventaire* : biens de valeur avec photo, pièce, prix, valeur, n° de série, garantie ; export imprimable / PDF pour l'assureur.

## Opération à zéro
Le mois à partir duquel revendre **au prix d'achat** ne fait plus rien perdre : **capital remboursé ≥ frais perdus**, avec frais perdus = intérêts et assurance payés (échéances − capital amorti) + frais d'achat de la fiche (notaire, agence) + indemnités de remboursement anticipé légales si vente ce mois-là (min(6 mois d'intérêts, 3 % du capital restant dû)). Aucune hypothèse à saisir. Calcul : `zeroOperation` dans `js/core/calc.js`.

## Fichiers joints
Photos et PDF (documents, inventaire) sont stockés hors du nœud synchronisé, sous `users/<uid>/maison_files/<id>`, et lus seulement quand on les ouvre ; une copie est gardée sur l'appareil (IndexedDB) pour le hors ligne.

## Lien avec Carnet
Une fois les données du compte chargées, Ma Maison publie en arrière-plan un court résumé (entretiens en retard ou à moins de 30 jours et garanties qui expirent, avec leur date ; tâches du calendrier de saison du mois restant à faire — aucune donnée financière) dans `users/<uid>/carnet/maison_alerts`, le nœud de Carnet du même compte (écriture par le SDK, `linkSet` de `js/services/firebase.js`). Carnet le lit dans son propre nœud et l'affiche dans l'onglet Tâches (et dans son calendrier du mois). Envoi regroupé (court délai), seulement si le contenu a changé, et best-effort : une erreur est ignorée et retentée au prochain changement. **Sans compte connecté (mode hors ligne), rien n'est publié** ; rien non plus si la lecture du compte a échoué, et un changement de compte abandonne l'envoi en attente (jamais de résumé d'un compte publié dans un autre). Aucune règle à publier : `users/$uid` couvre déjà ce nœud.

## Lien avec Mon Budget
Les interventions d'entretien avec un coût, datées **à partir du 1er octobre 2026**, sont publiées dans `users/<uid>/budget/linked/maison` (`{ updatedAt, items: { <id>: { date, amount en centimes, label, kind } } }`, même compte) et apparaissent dans Mon budget comme dépenses « Logement » en lecture seule — plus de double saisie. Mêmes garde-fous que pour Carnet (données chargées, contenu inchangé = pas d'envoi, rien sans compte). Détail dans `js/services/budget-sync.js`.

## Rappels (pastille et notifications)
- **Pastille** sur l'icône de l'app installée : nombre d'entretiens en retard, mis à jour à chaque ouverture et par chaque notification (API Badging).
- **Notifications du matin** : Réglages › **Rappels** › « Activer les rappels » (sur iPhone : iOS 16.4 ou plus, app ajoutée à l'écran d'accueil puis ouverte depuis son icône ; compte connecté). Une notification arrive quand un entretien tombe dans 7 jours, le jour même ou passe en retard (puis chaque lundi tant qu'il reste en retard), et quand une garantie ou une échéance tombe dans 30 jours, 7 jours ou le jour même. Rien à dire : aucune notification. Un appui ouvre l'onglet Entretien.
- **Fonctionnement, gratuit** : l'app publie dans `users/<uid>/maison_push` les titres et dates de ses échéances (`digest`, aucune donnée financière) et le jeton de chaque appareil abonné (`devices`). Chaque matin, `.github/workflows/rappels.yml` (GitHub Actions) lance `scripts/rappels/send.mjs`, qui calcule ce qui tombe ce jour-là (heure de Paris) et l'envoie par Firebase Cloud Messaging. FCM et la base restent sur l'offre Spark gratuite (pas de Cloud Functions) ; un envoi quotidien d'environ une minute reste dans le quota gratuit de GitHub Actions. Les jetons expirés sont retirés automatiquement ; les journaux n'affichent ni titres ni comptes.
- **Mise en service, une seule fois** : console Firebase › Paramètres du projet › Comptes de service › « Générer une nouvelle clé privée » ; copier tout le contenu du fichier JSON dans GitHub › Settings › Secrets and variables › Actions › New repository secret nommé `FIREBASE_SERVICE_ACCOUNT`, puis supprimer le fichier. Essai : onglet Actions › « Rappels du matin » › Run workflow (case « Essai » cochée : calcule sans rien envoyer). Ne jamais versionner cette clé (voir `.gitignore`).
- Aucune règle à publier : `users/$uid` couvre déjà `maison_push`, et le script lit avec le compte de service.

## Rubriques
Réglages › **Rubriques** : interrupteurs **Travaux**, **Achat (simulations)** et **Inventaire**, enregistrés dans la clé synchronisée `sections` (`{ works, projects, inventory }`, booléens ; même choix sur tous vos appareils). Sans choix de votre part, une rubrique n'est affichée que si elle contient des données (elle reste affichée jusqu'au prochain lancement si vous en supprimez le dernier élément). Rubrique masquée :
- Travaux : onglet retiré de la barre (4 onglets), indicateur et section « Travaux » de l'accueil masqués ;
- Achat / Inventaire : sous-onglet retiré (le contrôle segmenté disparaît s'il ne reste qu'un sous-onglet) ; garanties de l'inventaire retirées de l'accueil ;
- un lien vers une rubrique masquée (`#/travaux…`, `#/finances/projet`, `#/dossier/inventaire`) ramène à l'onglet parent (Accueil pour Travaux).

Les données ne sont jamais effacées : réafficher la rubrique les retrouve. Code : `js/core/sections.js`.

## Style
Style minimaliste commun aux apps (anthracite, cartes pleines) avec la couleur **Ardoise** (or). Réglages › Thème : **Auto** (par défaut : suit le réglage clair / sombre de l'appareil, en direct), Sombre ou Clair. L'ancien défaut « Sombre » enregistré devient « Auto » une seule fois (drapeau `maison_theme_auto`) ; « Clair » est conservé. Le script anti-flash de `index.html` applique le thème (et la couleur de la barre d'état : `#16171c` sombre, `#f4f4f7` clair) avant l'affichage. Graphiques en couleurs franches, mêmes teintes que Carnet (`--series-*` dans `css/theme.css`).

## Logo
Maison or (dégradé du thème) sur fond anthracite, avec la ligne d'horizon commune aux logos des apps (`icon.svg`, décliné en `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`). Les anciennes propositions sont gardées dans `logos/`.

## Test local
```
python3 -m http.server 8000
```
puis http://localhost:8000.

# Ma Maison

Suivi de la maison : entretien et calendrier de saison, chiffrage des travaux, énergie & charges, crédit et « opération à zéro », simulation d'achat, documents et inventaire des biens de valeur.
HTML/CSS/JavaScript purs (modules ES, sans build) + Firebase gratuit (Auth e-mail et Realtime Database), sur le même modèle que **Mon Garage**.

## Structure
```
index.html              onglets (Rappels, Maison, Coûts ; Travaux et Dossier ouverts depuis Maison) et feuilles de saisie
css/                    tokens, composants, vues ; vivant.css = style « Vivant » (même famille que Mon Garage, thème auto / sombre / clair)
js/core/                schéma des données, store (local + synchro clé par clé), calculs (échéances, travaux, crédit), rubriques affichées
js/services/            Firebase, stockage local, fichiers joints, liens avec Carnet et Mon budget
js/features/            pop-up des entretiens en retard, import du tableau d'amortissement
vendor/                 pdf.js et SheetJS (lecture PDF / Excel, chargés seulement à l'import)
logos/                  propositions de logo (icon.svg = logo retenu : maison en ligne continue)
js/ui/                  icônes, toasts, fenêtres, graphiques, mouvement (ressorts) et geste « glisser quand c'est fait »
js/views/               maison (chalet dessiné, fil de l'année), fiche maison, entretien, travaux, projet immobilier
js/config/              configuration Firebase
database.rules.json     règles Realtime Database (chaque compte ne voit que ses données)
```

## Compte et données
- **Même projet Firebase (test-e27e9) et même compte que Mon Garage, Carnet, Allure et Mon budget** : on se connecte avec le même e-mail / mot de passe. Les données sont rangées à part, sous `users/<uid>/maison` (fichiers joints : `users/<uid>/maison_files/<id>`) — les règles existantes (`users/$uid`) les couvrent déjà, rien à republier.
- Liens avec les autres apps, écrits dans le même compte : `users/<uid>/carnet/maison_alerts` (Carnet) et `users/<uid>/budget/linked/maison` (Mon budget). Plus aucun envoi vers les anciennes bases publiques de Carnet et de Mon budget.
- Local : `localStorage`, préfixe `ma_maison_v1_` ; fonctionne hors ligne puis resynchronise.

## Onglets
Barre du bas à trois onglets, comme Mon Garage : **Rappels · Maison · Coûts**. Travaux, Achat et Inventaire sont des rubriques facultatives (voir « Rubriques » plus bas).
- **Maison** (accueil) : le **chalet dessiné**, avec une pastille posée sur chaque équipement qui demande quelque chose (rouge = en retard, or = bientôt ; catégorie d'entretien → place sur le dessin, voir `js/views/chalet.js`). Un appui sur une pastille ouvre « Noter l'intervention » (plusieurs entretiens au même endroit : la liste des rappels). Dessous, **le fil de l'année** : les échéances des douze prochains mois sur une route, comme dans Mon Garage. Puis garanties qui expirent, **Dans la maison** (fiche, Travaux, Documents, Inventaire) et valeur & crédit. Au lancement, une fenêtre liste en une seule fois les entretiens en retard ; un appui sur l'un d'eux ouvre directement la saisie de l'intervention.
- **Rappels** : l'entretien. Glisser un rappel vers la droite (ou toucher ✓) ouvre **« Noter l'intervention »** : coût, date, qui l'a fait, documents (facture, photos, PDF), note.
- **Coûts** : charges, crédit & revente, achat (détail plus bas).
- **Rappels (détail)**
  - *Plan & historique* : plan d'entretien pré-rempli selon le chauffage (obligations légales signalées), bouton « Fait », historique par année. La facture d'une intervention (photos ou PDF) se joint dans son formulaire et est rangée automatiquement dans Dossier › Documents (document « Facture » relié, étiquette « Entretien ») ; supprimer l'intervention supprime aussi sa facture.
  - *Calendrier de saison* : tâches courantes mois par mois (purge des radiateurs, gouttières, hivernage…), adaptées au chauffage et au type de logement ; à cocher chaque année, masquables, tâches perso possibles.
- **Travaux** : projets chiffrés poste par poste (HT, TVA 5,5/10/20 %, imprévus, aides) → reste à charge, épargne mensuelle à prévoir, suivi du dépensé.
- **Coûts (détail)**
  - *Charges* : charges récurrentes (mensualisations, assurance, box…) et factures ponctuelles (taxe foncière, régularisations…) — pas de relevé de compteur. Total sur 12 mois glissants, graphique mensuel par catégorie, répartition.
  - *Crédit & revente* : version minimale — date de l'**opération à zéro** (voir ci-dessous), capital remboursé face aux frais perdus, puis le crédit en cours (capital restant dû, mensualité, fin). **Tableau d'amortissement** de la banque importable (PDF, Excel, CSV ou texte collé : colonnes détectées, échéances déjà payées reconstituées), sinon calcul depuis la fiche.
  - *Achat* : simulations d'achat comparables (notaire, apport dont revente de la maison actuelle, mensualité, endettement 35 %, capacité d'emprunt, reste à vivre).
- **Dossier** (depuis Maison › Dans la maison)
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

## Pastille de l'icône
Sur l'app installée, l'icône porte le nombre d'entretiens en retard, mis à jour à chaque ouverture (API Badging, `js/services/badge.js`). Les notifications et widgets sont réservés à Carnet, qui centralise les rappels des apps.

## Rubriques
Réglages › **Rubriques** : interrupteurs **Travaux**, **Achat (simulations)** et **Inventaire**, enregistrés dans la clé synchronisée `sections` (`{ works, projects, inventory }`, booléens ; même choix sur tous vos appareils). Sans choix de votre part, une rubrique n'est affichée que si elle contient des données (elle reste affichée jusqu'au prochain lancement si vous en supprimez le dernier élément). Rubrique masquée :
- Travaux : ligne « Travaux » retirée de l’onglet Maison ;
- Achat / Inventaire : sous-onglet retiré (le contrôle segmenté disparaît s'il ne reste qu'un sous-onglet) ; garanties de l'inventaire retirées de l'accueil ;
- un lien vers une rubrique masquée (`#/travaux…`, `#/finances/projet`, `#/dossier/inventaire`) ramène à l'onglet parent (Maison pour Travaux).

Les données ne sont jamais effacées : réafficher la rubrique les retrouve. Code : `js/core/sections.js`.

## Style
Style minimaliste commun aux apps (anthracite, cartes pleines) avec la couleur **Ardoise** (or). Réglages › Thème : **Auto** (par défaut : suit le réglage clair / sombre de l'appareil, en direct), Sombre ou Clair. L'ancien défaut « Sombre » enregistré devient « Auto » une seule fois (drapeau `maison_theme_auto`) ; « Clair » est conservé. Le script anti-flash de `index.html` applique le thème (et la couleur de la barre d'état : `#16171c` sombre, `#f4f4f7` clair) avant l'affichage. Graphiques en couleurs franches, mêmes teintes que Carnet (`--series-*` dans `css/theme.css`).

## Logo
Ligne continue : une maison dessinée d'un seul trait, de la ligne de sol à la porte en arche, en dégradé ambre → rouge sur fond blanc (`icon.svg`, décliné en `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`). Même famille que les logos de Mon Garage et Mon Budget. Les anciennes propositions sont gardées dans `logos/` (le logo précédent, maison or sur anthracite : `logos/maison-or-horizon.svg`).

## Test local
```
python3 -m http.server 8000
```
puis http://localhost:8000.

# Ma Maison

Suivi de la maison : entretien et calendrier de saison, chiffrage des travaux, énergie & charges, crédit et « opération à zéro », simulation d'achat, documents et inventaire des biens de valeur.
HTML/CSS/JavaScript purs (modules ES, sans build) + Firebase gratuit (Auth e-mail et Realtime Database), sur le même modèle que **Mon Garage**.

## Structure
```
index.html              5 onglets (Accueil, Entretien, Travaux, Finances, Dossier) et feuilles de saisie
css/                    tokens, style « Ardoise » (sombre / clair), composants, vues
js/core/                schéma des données, store (local + synchro clé par clé), calculs (échéances, travaux, crédit)
js/services/            Firebase, stockage local
js/features/            pop-up des entretiens en retard, import du tableau d'amortissement
vendor/                 pdf.js et SheetJS (lecture PDF / Excel, chargés seulement à l'import)
logos/                  propositions de logo (icon.svg = logo retenu)
js/ui/                  icônes, toasts, fenêtres, graphiques
js/views/               accueil, fiche maison, entretien, travaux, projet immobilier
js/config/              configuration Firebase
database.rules.json     règles Realtime Database (chaque compte ne voit que ses données)
```

## Compte et données
- **Même projet Firebase et même compte que Mon Garage** : on se connecte avec le même e-mail / mot de passe. Les données sont rangées à part, sous `users/<uid>/maison` — les règles existantes (`users/$uid`) les couvrent déjà, rien à republier.
- Local : `localStorage`, préfixe `ma_maison_v1_` ; fonctionne hors ligne puis resynchronise.

## Onglets
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
Une fois les données du compte chargées, Ma Maison publie en arrière-plan un court résumé (entretiens en retard ou à moins de 30 jours et garanties qui expirent, avec leur date ; tâches du calendrier de saison du mois restant à faire — aucune donnée financière) dans `app/maison_alerts` de la base de Carnet, affiché en direct dans l'onglet Tâches de Carnet (et dans son calendrier du mois). ⚠️ Publier une fois les règles de Carnet (`database.rules.json` du dépôt Carnet) dans la console Firebase.

## Lien avec Mon Budget
Les interventions d'entretien avec un coût, datées **à partir du 1er octobre 2026**, sont publiées dans la base de Mon Budget (`budget/linked/maison`) et y apparaissent comme dépenses « Logement » en lecture seule — plus de double saisie. ⚠️ Publier une fois les règles de Mon Budget (`database.rules.json` du dépôt Mon budget). Détail dans `js/services/budget-sync.js`.

## Style
Style minimaliste commun aux apps (anthracite, cartes pleines) avec la couleur **Ardoise** (or), en thème sombre ou clair (Réglages). Graphiques en couleurs franches, mêmes teintes que Carnet (`--series-*` dans `css/theme.css`).

## Logo
Maison or (dégradé du thème) sur fond anthracite, avec la ligne d'horizon commune aux logos des apps (`icon.svg`, décliné en `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`). Les anciennes propositions sont gardées dans `logos/`.

## Test local
```
python3 -m http.server 8000
```
puis http://localhost:8000.

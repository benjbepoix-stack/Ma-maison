# Ma Maison

Suivi de la maison : plan d'entretien et historique des interventions, chiffrage des travaux à venir, simulation d'achat immobilier (avec revente de la maison actuelle).
HTML/CSS/JavaScript purs (modules ES, sans build) + Firebase gratuit (Auth e-mail et Realtime Database), sur le même modèle que **Mon Garage**.

## Structure
```
index.html              4 onglets (Accueil, Entretien, Travaux, Projet) et feuilles de saisie
css/                    tokens, thème graphite + style « Ardoise » (sombre / clair), composants, vues
js/core/                schéma des données, store (local + synchro clé par clé), calculs (échéances, travaux, crédit)
js/services/            Firebase, stockage local
js/features/            pop-up des entretiens en retard au démarrage
js/ui/                  icônes, toasts, fenêtres, graphiques
js/views/               accueil, fiche maison, entretien, travaux, projet immobilier
js/config/              configuration Firebase
database.rules.json     règles Realtime Database (chaque compte ne voit que ses données)
```

## Compte et données
- **Même projet Firebase et même compte que Mon Garage** : on se connecte avec le même e-mail / mot de passe. Les données sont rangées à part, sous `users/<uid>/maison` — les règles existantes (`users/$uid`) les couvrent déjà, rien à republier.
- Local : `localStorage`, préfixe `ma_maison_v1_` ; fonctionne hors ligne puis resynchronise.

## Onglets
- **Accueil** : fiche de la maison (surface, année, chauffage, DPE), entretiens en retard / à 30 jours, travaux à venir, valeur & crédit (plus-value latente, capital restant dû, patrimoine net).
- **Entretien** : plan d'entretien pré-rempli selon le chauffage (chaudière, ramonage, PAC, détecteurs de fumée, gouttières, VMC, chauffe-eau, toiture… obligations légales signalées), barre de progression vers l'échéance, bouton « Fait » ; historique des interventions par année avec coût et prestataire. Une intervention peut remettre à zéro plusieurs rappels d'un coup.
- **Travaux** : projets chiffrés poste par poste (quantité × prix unitaire HT, matériaux / main-d'œuvre), TVA (5,5 / 10 / 20 %), marge d'imprévus, aides (MaPrimeRénov', CEE…) → reste à charge ; statut, priorité, date visée et **épargne mensuelle à prévoir**, suivi du dépensé vs budget.
- **Projet** : simulations d'achat comparables — prix, notaire (≈ 8 % ancien / 2,5 % neuf, modifiable), agence, travaux, apport (épargne + **revente de la maison actuelle moins le capital restant dû**), taux, durée, assurance, garantie, frais de dossier → mensualité, coût total, coût du crédit, taux d'endettement (35 % HCSF), capacité d'emprunt, reste à vivre, remboursement par année et tableau comparatif.

## Logo
Maison au trait or sur fond bleu nuit, fenêtre éclairée (`icon.svg`, décliné en `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`). Même famille graphique que le volant de Mon Garage.

## Test local
```
python3 -m http.server 8000
```
puis http://localhost:8000.

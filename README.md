# Ma Maison

Suivi de la maison : entretien et calendrier de saison, chiffrage des travaux, énergie & charges, crédit et revente (« opération à zéro »), simulation d'achat, documents et inventaire des biens de valeur.
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
- **Accueil** : fiche de la maison, entretiens en retard / à 30 jours, charges par mois, tâches de saison du mois, garanties qui expirent, travaux à venir, valeur & crédit.
- **Entretien**
  - *Plan & historique* : plan d'entretien pré-rempli selon le chauffage (obligations légales signalées), bouton « Fait », historique par année.
  - *Calendrier de saison* : tâches courantes mois par mois (purge des radiateurs, gouttières, hivernage…), adaptées au chauffage et au type de logement ; à cocher chaque année, masquables, tâches perso possibles.
- **Travaux** : projets chiffrés poste par poste (HT, TVA 5,5/10/20 %, imprévus, aides) → reste à charge, épargne mensuelle à prévoir, suivi du dépensé.
- **Finances**
  - *Charges* : charges récurrentes (mensualisations, assurance, box…) et factures ponctuelles (taxe foncière, régularisations…) — pas de relevé de compteur. Total sur 12 mois glissants, graphique mensuel par catégorie, répartition.
  - *Crédit & revente* : import du **tableau d'amortissement** de la banque (PDF, Excel, CSV ou texte collé), sinon calcul depuis la fiche. Analyse de revente : voir ci-dessous.
    - Colonnes « échéance », « capital restant dû » et « capital amorti » détectées automatiquement (modifiables), y compris quand le capital dû est donné **avant** l'échéance (converti en « après »).
    - Montant emprunté et taux lus dans l'en-tête quand la banque les indique (ex. CIC « Crédit accordé », « Taux fixe actuel »).
    - Tableau qui ne commence qu'à l'échéance en cours (consultation de l'encours) : les échéances déjà payées sont **reconstituées** à partir du montant emprunté, du taux et de la mensualité (nombre d'échéances passées = ln((m − R·i)/(m − P·i)) / ln(1 + i)).
    - Le crédit de la fiche maison est complété s'il était vide.
  - *Achat* : simulations d'achat comparables (notaire, apport dont revente de la maison actuelle, mensualité, endettement 35 %, capacité d'emprunt, reste à vivre).
- **Dossier**
  - *Documents* : acte, factures, garanties, diagnostics… avec photos et PDF (10 par document, 4 Mo par PDF), date de fin de garantie signalée à l'approche.
  - *Inventaire* : biens de valeur avec photo, pièce, prix, valeur, n° de série, garantie ; export imprimable / PDF pour l'assureur.

## Revente : « opération à zéro »
Pour chaque mois, d'aujourd'hui à 2 ans après la dernière échéance :
- **Net vendeur** = prix de vente − frais d'agence (%) − autres frais − capital restant dû − indemnités de remboursement anticipé (IRA légales : min(6 mois d'intérêts, 3 % du capital restant dû), ou aucune si exonération).
- **Argent investi** = apport initial (prix + frais d'achat − montant emprunté) + échéances payées (intérêts et assurance compris) + options : travaux réalisés, entretien, taxe foncière.
- **Opération à zéro** : premier mois où le net vendeur rembourse tout l'argent investi. **Solder le crédit** : premier mois où le prix couvre capital restant dû + IRA + frais.
- Le prix de vente (par défaut la valeur estimée de la fiche) évolue chaque année du pourcentage choisi. Résidence principale : pas d'impôt sur la plus-value.

## Valorisation
Carte « Estimation de la valeur » sur l'accueil, trois estimations côte à côte :
- **Ventes du quartier** (base publique DVF — Demandes de valeurs foncières) : l'adresse est géocodée (Géoplateforme IGN, sinon Base Adresse Nationale), puis les ventes de maisons de la commune sont chargées depuis les fichiers geo-dvf d'Etalab (sinon l'API DVF open data du Cerema). Prix au m² = valeur foncière / surface bâtie, valeurs extrêmes écartées ; **médiane des 24 derniers mois dans un rayon de 1 km** (2 km, puis la commune s'il y a moins de 8 ventes) × surface habitable, ajustée selon le DPE (A/B +6 %, C +3 %, D 0, E −3 %, F −7 %, G −12 %) et d'une correction libre en %.
- **Prix d'achat indexé** : prix d'achat × évolution de la médiane au m² de la commune entre l'année d'achat et l'année la plus récente.
- **Votre estimation** (saisie dans la fiche) : prioritaire si renseignée.

Valeur retenue = votre estimation, sinon ventes du quartier, sinon prix indexé. Elle sert à la plus-value latente, au patrimoine net, au prix de vente par défaut (revente) et à la revente dans les simulations d'achat. Les ventes sont rechargées automatiquement tous les 30 jours (bouton « Actualiser » sinon). Si les données publiques ne répondent pas, un prix au m² peut être imposé dans les réglages de l'estimation.

## Fichiers joints
Photos et PDF (documents, inventaire) sont stockés hors du nœud synchronisé, sous `users/<uid>/maison_files/<id>`, et lus seulement quand on les ouvre ; une copie est gardée sur l'appareil (IndexedDB) pour le hors ligne.

## Lien avec Carnet
Ma Maison publie en arrière-plan un court résumé (entretiens en retard ou proches, garanties qui expirent, tâches de saison du mois — aucune donnée financière) dans `app/maison_alerts` de la base de Carnet, affiché en direct dans le widget « Maison » de l'accueil de Carnet. ⚠️ Publier une fois les règles de Carnet (`database.rules.json` du dépôt Carnet) dans la console Firebase.

## Style
Style unique **Ardoise** (bleu nuit et or), en thème sombre ou clair (Réglages).

## Logo
« Verre dépoli » : maison blanche sur une plaque de verre translucide, halos or et bleu sur fond bleu nuit (`icon.svg`, décliné en `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`). Les autres propositions sont gardées dans `logos/`.

## Test local
```
python3 -m http.server 8000
```
puis http://localhost:8000.

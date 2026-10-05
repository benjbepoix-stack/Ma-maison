/*
 * Calendrier de saison : tâches courantes mois par mois (climat français).
 * tag : garden (si terrain), pool (piscine), fuel (bois / fioul / granulés).
 * Les tâches qui ne concernent pas la maison peuvent être masquées.
 */
const T = (month, id, label, category, tag = '') => ({ id: `s${month}-${id}`, month, label, category, tag });

export const SEASON_TASKS = [
  T(1, 'air', 'Repérer les courants d’air (fenêtres, portes)', 'Menuiseries'),
  T(1, 'gel', 'Protéger les canalisations extérieures du gel', 'Plomberie'),
  T(1, 'fruit', 'Tailler les arbres fruitiers', 'Extérieur & jardin', 'garden'),
  T(2, 'toit', 'Inspecter la toiture après les tempêtes', 'Toiture & façade'),
  T(2, 'rosiers', 'Tailler rosiers et arbustes', 'Extérieur & jardin', 'garden'),
  T(2, 'humid', 'Surveiller l’humidité et aérer chaque jour', 'Autre'),
  T(3, 'terrasse', 'Nettoyer terrasse et mobilier de jardin', 'Extérieur & jardin', 'garden'),
  T(3, 'robinets', 'Remettre en eau les robinets extérieurs', 'Plomberie', 'garden'),
  T(3, 'gouttieres', 'Contrôler gouttières et descentes après l’hiver', 'Toiture & façade'),
  T(3, 'pelouse', 'Scarifier et regarnir la pelouse', 'Extérieur & jardin', 'garden'),
  T(4, 'clim', 'Faire entretenir la climatisation avant l’été', 'Chauffage'),
  T(4, 'vitres', 'Laver vitres, volets et moustiquaires', 'Menuiseries'),
  T(4, 'mousse', 'Démousser toiture et allées si besoin', 'Toiture & façade'),
  T(5, 'piscine', 'Remettre en route la piscine', 'Extérieur & jardin', 'pool'),
  T(5, 'lasure', 'Traiter les boiseries extérieures (lasure, saturateur)', 'Menuiseries'),
  T(5, 'bbq', 'Nettoyer le barbecue et la plancha', 'Extérieur & jardin', 'garden'),
  T(6, 'haies', 'Tailler les haies', 'Extérieur & jardin', 'garden'),
  T(6, 'joints', 'Vérifier les joints (douche, baignoire, éviers)', 'Plomberie'),
  T(6, 'arrosage', 'Contrôler l’arrosage automatique', 'Extérieur & jardin', 'garden'),
  T(7, 'rdv', 'Prendre rendez-vous pour l’entretien du chauffage', 'Chauffage'),
  T(7, 'stores', 'Vérifier stores et protections solaires', 'Menuiseries'),
  T(8, 'combustible', 'Commander bois, granulés ou fioul (prix d’été)', 'Chauffage', 'fuel'),
  T(8, 'ramonage', 'Faire ramoner avant la saison de chauffe', 'Chauffage', 'fuel'),
  T(8, 'absence', 'Avant de partir : couper l’eau, programmer le chauffage', 'Sécurité'),
  T(9, 'purge', 'Purger les radiateurs', 'Chauffage'),
  T(9, 'calfeutrage', 'Refaire le calfeutrage portes et fenêtres', 'Menuiseries'),
  T(9, 'plantes', 'Rentrer les plantes fragiles', 'Extérieur & jardin', 'garden'),
  T(10, 'hivernage', 'Hiverner la piscine', 'Extérieur & jardin', 'pool'),
  T(10, 'robinets', 'Purger et couper les robinets extérieurs', 'Plomberie', 'garden'),
  T(10, 'detecteurs', 'Tester détecteurs de fumée et de CO (changement d’heure)', 'Sécurité'),
  T(10, 'feuilles', 'Ramasser les feuilles', 'Extérieur & jardin', 'garden'),
  T(11, 'gouttieres', 'Nettoyer gouttières et chéneaux', 'Toiture & façade'),
  T(11, 'mobilier', 'Ranger le mobilier de jardin, protéger les plantes', 'Extérieur & jardin', 'garden'),
  T(11, 'chauffe-eau', 'Vérifier le chauffe-eau (fuites, groupe de sécurité)', 'Plomberie'),
  T(12, 'extincteur', 'Vérifier extincteur et sorties de secours', 'Sécurité'),
  T(12, 'congelateur', 'Dégivrer le congélateur', 'Électroménager'),
  T(12, 'bilan', 'Faire le bilan des charges et prévoir les travaux de l’année', 'Autre')
];

export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Tâches qui concernent cette maison (avant masquage manuel). */
export function relevantTasks(home) {
  const fuel = ['Bois / granulés', 'Fioul'].includes(home?.heating);
  const garden = home?.type !== 'Appartement';
  return SEASON_TASKS.filter(t => (t.tag === 'fuel' ? fuel : t.tag === 'garden' || t.tag === 'pool' ? garden : true));
}

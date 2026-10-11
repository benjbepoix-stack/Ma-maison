/*
 * Rubriques facultatives (Réglages › Rubriques) : Travaux, Achat (simulations)
 * et Inventaire. Choix synchronisé dans la clé `sections` ({ works, projects,
 * inventory }, booléens). Sans choix enregistré, une rubrique n'est affichée
 * que si elle contient des données ; une fois affichée, elle le reste jusqu'au
 * prochain lancement (supprimer le dernier élément ne fait pas disparaître
 * l'onglet sous vos yeux).
 */
import * as store from './store.js';
import { SECTION_KEYS } from './schema.js';

export const SECTIONS = {
  works: 'Travaux',
  projects: 'Achat (simulations)',
  inventory: 'Inventaire'
};

const shown = new Set(); // rubriques affichées par défaut pendant cette session

export function sectionOn(key) {
  const choice = store.get('sections')?.[key];
  if (typeof choice === 'boolean') return choice;
  if (store.get(key)?.length) shown.add(key);
  return shown.has(key);
}

/** Choix explicite (interrupteur des réglages) : les autres rubriques gardent leur règle. */
export function setSection(key, on) {
  if (!SECTION_KEYS.includes(key)) return;
  store.set('sections', { ...(store.get('sections') || {}), [key]: Boolean(on) });
}

/** Changement de compte : la règle par défaut repart des données du nouveau compte. */
export const resetSections = () => shown.clear();

/*
 * Widget « Maison » de Carnet (Mon tableau de bord) : Ma Maison publie en
 * arrière-plan un court résumé de ce qui est à faire (entretiens en retard ou
 * proches, garanties qui expirent, tâches de saison du mois) dans le nœud de
 * Carnet du même compte : users/<uid>/carnet/maison_alerts (même projet
 * Firebase, écriture par le SDK). Carnet le lit sans jamais l'écrire.
 * Best-effort, comme le widget Garage : une erreur est ignorée et retentée au
 * prochain changement. Sans compte (mode local) : rien n'est publié.
 * Aucune donnée financière n'est envoyée.
 */
import { linkSet, currentUser } from './firebase.js';

const PATH = 'carnet/maison_alerts';

let lastSent = null;
let timer = null;
let pending = null;
let readyUid = null; // compte dont les données sont chargées

const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
};

/** À appeler une fois les données du compte chargées (évite de publier un résumé périmé ou vide). */
export function enableMaisonSync() {
  readyUid = currentUser()?.uid || null;
  if (pending && readyUid) schedule();
}

/** Changement de compte : le résumé en attente (données de l'ancien compte) n'est jamais publié. */
export function resetMaisonSync() {
  clearTimeout(timer);
  pending = null;
  readyUid = null;
}

/** digest = { name, updatedAt, alerts: [{ level: 'late'|'soon', title, text, due? }], season, seasonMonth } */
export function scheduleMaisonSync(digest) {
  pending = digest;
  if (readyUid) schedule();
}

async function flush() {
  const uid = currentUser()?.uid;
  // Pas de compte, ou compte dont les données ne sont pas encore chargées : on attend.
  if (!pending || !uid || uid !== readyUid) return;
  const digest = pending;
  pending = null;
  // updatedAt exclu de la comparaison : on n'envoie que si le contenu change.
  const key = `${uid}:${JSON.stringify({ ...digest, updatedAt: 0 })}`;
  if (key === lastSent) return;
  try {
    await linkSet(PATH, digest);
    lastSent = key;
  } catch {
    /* best-effort */
  }
}

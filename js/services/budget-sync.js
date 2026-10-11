/*
 * Liaison avec l'app Mon Budget : les interventions d'entretien saisies ici
 * (avec un coût) sont publiées dans le nœud de Mon Budget du même compte,
 * users/<uid>/budget/linked/maison (même projet Firebase, écriture par le
 * SDK), pour y apparaître sans double saisie. Mon Budget les lit (lecture
 * seule) et les compte dans ses dépenses du mois.
 *
 * - Uniquement à partir du 1er octobre 2026 (date de mise en place du lien) :
 *   ce qui précède a déjà été saisi à la main dans Mon Budget.
 * - Montants en centimes (format de Mon Budget), aucune pièce jointe envoyée.
 * - Best-effort, comme le lien avec Carnet : une erreur est ignorée et
 *   retentée au prochain changement. Sans compte (mode local) : rien n'est publié.
 */
import { linkSet, currentUser } from './firebase.js';

const PATH = 'budget/linked/maison';
export const LINK_START = '2026-10-01';

let lastSent = null;
let timer = null;
let pending = null;
let readyUid = null; // compte dont les données sont chargées

const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(flush, 2000);
};

/**
 * À appeler une fois les données réellement chargées (cloud reçu) : évite de
 * publier une liste vide depuis un appareil pas encore synchronisé, ce qui
 * effacerait momentanément les dépenses côté Mon Budget.
 */
export function enableBudgetSync() {
  readyUid = currentUser()?.uid || null;
  if (pending && readyUid) schedule();
}

/** Changement de compte : la liste en attente (données de l'ancien compte) n'est jamais publiée. */
export function resetBudgetSync() {
  clearTimeout(timer);
  pending = null;
  readyUid = null;
}

/** Construit la liste publiée depuis l'historique d'entretien et planifie l'envoi (court débounce). */
export function scheduleBudgetSync(maintenance) {
  const items = {};
  maintenance
    .filter(x => x.date >= LINK_START && x.cost > 0)
    .forEach(x => {
      items[x.id] = { date: x.date, amount: Math.round(x.cost * 100), label: (x.label || x.category).slice(0, 120), kind: x.category };
    });
  pending = items;
  if (readyUid) schedule();
}

async function flush() {
  const uid = currentUser()?.uid;
  // Pas de compte, ou compte dont les données ne sont pas encore chargées : on attend.
  if (!pending || !uid || uid !== readyUid) return;
  const items = pending;
  pending = null;
  const key = `${uid}:${JSON.stringify(items)}`;
  if (key === lastSent) return;
  try {
    await linkSet(PATH, { updatedAt: Date.now(), items });
    lastSent = key;
  } catch {
    /* best-effort */
  }
}

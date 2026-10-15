/*
 * Rappels sur l'appareil, sans ouvrir l'app :
 * - pastille sur l'icône (nombre d'entretiens en retard), API Badging ;
 * - notifications envoyées chaque matin par un petit script gratuit
 *   (GitHub Actions, voir scripts/rappels/) via Firebase Cloud Messaging.
 *
 * L'app publie dans users/<uid>/maison_push :
 *   digest  = { updatedAt, items: [{ kind: 'entretien'|'garantie', title, due }] }
 *   devices = { <id>: { token, updatedAt } }   (un par appareil abonné)
 * Le script lit ces deux nœuds et calcule lui-même ce qui tombe le jour même :
 * les dates restent justes même si l'app n'est pas ouverte pendant des semaines.
 * Aucune donnée financière n'est publiée. Rien sans compte connecté.
 *
 * iPhone / iPad : iOS 16.4 ou plus récent, app ajoutée à l'écran d'accueil.
 */
import { FIREBASE_SDK_VERSION } from '../config/firebase-config.js';
import { linkSet, currentUser, firebaseApp } from './firebase.js';
import { readJSON, write } from './storage.js';

const SDK = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
const DIGEST_PATH = 'maison_push/digest';
const DEVICE_KEY = 'maison_push_device'; // { uid, id } : abonnement de cet appareil

/* ---------- Pastille sur l'icône ---------- */
export function setBadge(count) {
  try {
    if (count > 0) navigator.setAppBadge?.(count)?.catch?.(() => {});
    else navigator.clearAppBadge?.()?.catch?.(() => {});
  } catch {
    /* non pris en charge */
  }
}

/* ---------- État des notifications ---------- */
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const savedDevice = () => readJSON(DEVICE_KEY, null);

/** 'unsupported' | 'install' (iPhone hors écran d'accueil) | 'account' | 'denied' | 'off' | 'on' */
export function pushState() {
  if (isIos() && !standalone()) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!currentUser() || !firebaseApp()) return 'account';
  if (Notification.permission === 'denied') return 'denied';
  const dev = savedDevice();
  return Notification.permission === 'granted' && dev?.uid === currentUser().uid ? 'on' : 'off';
}

/* Identifiant court et stable d'un jeton (clé du nœud devices). */
const tokenId = token => {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) h = Math.imul(h ^ token.charCodeAt(i), 16777619);
  return `d${(h >>> 0).toString(36)}`;
};

async function messaging() {
  const mod = await import(`${SDK}/firebase-messaging.js`);
  if (!(await mod.isSupported())) throw new Error('Notifications non prises en charge sur cet appareil.');
  return { mod, msg: mod.getMessaging(firebaseApp()) };
}

/* Jeton de l'appareil, enregistré sous le compte (remplace l'ancien s'il a changé). */
async function registerToken() {
  const uid = currentUser()?.uid;
  if (!uid) throw new Error('Connectez-vous pour activer les rappels.');
  const { mod, msg } = await messaging();
  const registration = await navigator.serviceWorker.ready;
  const token = await mod.getToken(msg, { serviceWorkerRegistration: registration });
  if (!token) throw new Error('Jeton de notification indisponible.');
  const id = tokenId(token);
  const prev = savedDevice();
  if (prev?.uid === uid && prev.id === id) return;
  if (prev?.uid === uid && prev.id) await linkSet(`maison_push/devices/${prev.id}`, null).catch(() => {});
  await linkSet(`maison_push/devices/${id}`, { token, updatedAt: Date.now() });
  write(DEVICE_KEY, { uid, id });
}

/** À appeler sur un appui (iOS n'autorise la demande de permission qu'après un geste). */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications refusées dans les réglages de l’appareil.' : 'Notifications non autorisées.');
  write(DEVICE_KEY, 'null'); // force l'enregistrement du jeton
  await registerToken();
}

export async function disablePush() {
  const dev = savedDevice();
  write(DEVICE_KEY, 'null');
  if (dev?.id && dev.uid === currentUser()?.uid) await linkSet(`maison_push/devices/${dev.id}`, null).catch(() => {});
  try {
    const { mod, msg } = await messaging();
    await mod.deleteToken(msg);
  } catch {
    /* jeton déjà invalide */
  }
}

/* ---------- Résumé pour le script du matin ---------- */
let lastSent = null;
let timer = null;
let pending = null;
let readyUid = null;

/** Données du compte chargées : publication autorisée, jeton rafraîchi s'il a changé. */
export function enablePushSync() {
  readyUid = currentUser()?.uid || null;
  if (pending && readyUid) schedule();
  if (pushState() === 'on') registerToken().catch(error => console.warn('[push] jeton', error));
}

/** Changement de compte : rien de l'ancien compte n'est publié. */
export function resetPushSync() {
  clearTimeout(timer);
  pending = null;
  readyUid = null;
}

/** items = [{ kind, title, due: 'AAAA-MM-JJ' }] */
export function schedulePushDigest(items) {
  pending = items;
  if (readyUid) schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(flush, 2000);
}

async function flush() {
  const uid = currentUser()?.uid;
  if (!pending || !uid || uid !== readyUid) return;
  const items = pending;
  pending = null;
  const key = `${uid}:${JSON.stringify(items)}`;
  if (key === lastSent) return;
  try {
    await linkSet(DIGEST_PATH, { updatedAt: Date.now(), items });
    lastSent = key;
  } catch {
    /* best-effort : retenté au prochain changement */
  }
}

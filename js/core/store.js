/*
 * Store central : table plate de clés, persistance locale et synchronisation
 * cloud fine (chaque clé modifiée est envoyée seule) — même principe que
 * Mon Garage. Les écritures non confirmées sont conservées (maison_unsynced)
 * et renvoyées au prochain lancement.
 */
import { readJSON, write } from '../services/storage.js';
import { sameJSON } from './utils.js';
import { normalizeKey, isKnownKey, DEFAULTS } from './schema.js';

export const BASE = 'ma_maison_v1_';
const UNSYNCED_KEY = 'maison_unsynced';

const data = {};
const listeners = new Set();
let cloudSink = null;
let unsynced = {};

function persist(key) {
  try {
    if (key in data) localStorage.setItem(BASE + key, JSON.stringify(data[key]));
    else localStorage.removeItem(BASE + key);
  } catch (error) {
    console.warn('[store] écriture locale impossible', key, error);
  }
}
const persistUnsynced = () => write(UNSYNCED_KEY, JSON.stringify(unsynced));

function notify(keys, source) {
  listeners.forEach(fn => {
    try {
      fn(keys, source);
    } catch (error) {
      console.error('[store] erreur dans un abonné', error);
    }
  });
}

export function loadLocal() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(BASE)) continue;
      const key = k.slice(BASE.length);
      if (!isKnownKey(key)) continue;
      const value = normalizeKey(key, readJSON(k, null));
      if (value !== null) data[key] = value;
    }
  } catch (error) {
    console.warn('[store] lecture locale impossible', error);
  }
  const saved = readJSON(UNSYNCED_KEY, {});
  unsynced = saved && typeof saved === 'object' ? saved : {};
}

export const subscribe = fn => (listeners.add(fn), () => listeners.delete(fn));

/* ---------- Lecture (copies modifiables) ---------- */
export function get(key) {
  const value = data[key];
  return structuredClone(value === undefined ? DEFAULTS[key] ?? null : value);
}
export const home = () => get('home');
export const theme = () => data.theme || 'dark';
export const style = () => data.style || 'ardoise';

/* ---------- Écriture ---------- */
/** Enregistre un ensemble de clés : { clé: valeur } ; valeur null = suppression. */
export function setKeys(patch) {
  const payload = {};
  for (const [key, raw] of Object.entries(patch)) {
    const value = raw === null || raw === undefined ? null : normalizeKey(key, raw);
    if (value === null) {
      if (!(key in data)) continue;
      delete data[key];
    } else {
      if (sameJSON(value, data[key])) continue;
      data[key] = value;
    }
    persist(key);
    payload[key] = key in data ? data[key] : null;
    unsynced[key] = true;
  }
  if (!Object.keys(payload).length) return;
  persistUnsynced();
  cloudSink?.(payload);
  notify(Object.keys(payload), 'local');
}

export const set = (key, value) => setKeys({ [key]: value });

/** Remplace (ou ajoute) un élément d'une liste par son id. */
export function upsert(key, item) {
  const items = get(key);
  const i = items.findIndex(x => x.id === item.id);
  if (i === -1) items.push(item);
  else items[i] = item;
  set(key, items);
}
export const remove = (key, id) => set(key, get(key).filter(x => x.id !== id));

/* ---------- Synchronisation ---------- */
export function setCloudSink(fn) {
  cloudSink = fn;
  const keys = Object.keys(unsynced);
  if (keys.length) cloudSink(Object.fromEntries(keys.map(k => [k, k in data ? data[k] : null])));
}

export function acknowledge(keys) {
  let changed = false;
  keys.forEach(k => {
    if (unsynced[k]) {
      delete unsynced[k];
      changed = true;
    }
  });
  if (changed) persistUnsynced();
}

/** Applique l'état distant complet. */
export function applyRemote(remote) {
  const incoming = remote && typeof remote === 'object' ? remote : {};
  const keys = new Set([...Object.keys(data), ...Object.keys(incoming)].filter(isKnownKey));
  const changed = [];
  for (const key of keys) {
    if (unsynced[key]) continue; // modification locale en cours d'envoi
    if (key in incoming) {
      const next = normalizeKey(key, incoming[key]);
      if (next === null || sameJSON(next, data[key])) continue;
      data[key] = next;
    } else {
      if (!(key in data)) continue;
      delete data[key];
    }
    persist(key);
    changed.push(key);
  }
  if (changed.length) notify(changed, 'remote');
  return changed;
}

/** Efface toutes les données locales (changement de compte). */
export function resetLocal() {
  Object.keys(data).forEach(k => {
    delete data[k];
    persist(k);
  });
  unsynced = {};
  persistUnsynced();
  notify(['home'], 'reset');
}

export const cloudSnapshot = () => structuredClone(data);

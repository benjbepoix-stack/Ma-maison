/*
 * Pièces jointes (photos, PDF) des documents et de l'inventaire.
 * - Copie locale dans IndexedDB (le localStorage de Safari est limité à ~5 Mo).
 * - Copie cloud dans users/<uid>/maison_files/<id>, lue à la demande.
 * - Un envoi impossible (hors ligne) est retenté au lancement suivant.
 */
import { canUseCloudFiles, cloudFilePut, cloudFileGet, cloudFileDelete } from './firebase.js';
import { readJSON, write } from './storage.js';

const DB_NAME = 'ma_maison_files';
const STORE = 'files';
const PENDING_KEY = 'maison_files_pending';

let dbPromise = null;
function idb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function tx(mode, fn) {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  } catch (error) {
    console.warn('[files] IndexedDB indisponible', error);
    return undefined;
  }
}
const localGet = id => tx('readonly', s => s.get(id));
const localPut = (id, data) => tx('readwrite', s => s.put(data, id));
const localDelete = id => tx('readwrite', s => s.delete(id));

/* ---------- Envois en attente ---------- */
const pending = () => new Set(readJSON(PENDING_KEY, []));
const savePending = set => write(PENDING_KEY, JSON.stringify([...set]));

async function upload(id, data) {
  if (!canUseCloudFiles()) return false;
  try {
    await cloudFilePut(id, data);
    return true;
  } catch (error) {
    console.warn('[files] envoi impossible', id, error);
    return false;
  }
}

/** Enregistre un fichier (data URL) : local tout de suite, cloud dès que possible. */
export async function saveFile(id, data) {
  await localPut(id, data);
  if (!(await upload(id, data))) {
    const p = pending();
    p.add(id);
    savePending(p);
  }
}

/** Lit un fichier : copie locale, sinon cloud (puis mise en cache). */
export async function getFile(id) {
  const local = await localGet(id);
  if (local) return local;
  if (!canUseCloudFiles()) return null;
  const remote = await cloudFileGet(id);
  if (remote) await localPut(id, remote);
  return remote;
}

export async function deleteFile(id) {
  await localDelete(id);
  const p = pending();
  if (p.delete(id)) savePending(p);
  if (canUseCloudFiles()) cloudFileDelete(id).catch(() => {});
}

/** Renvoie les fichiers restés en attente (à appeler une fois connecté). */
export async function retryPendingFiles() {
  const p = pending();
  for (const id of [...p]) {
    // eslint-disable-next-line no-await-in-loop
    const data = await localGet(id);
    // eslint-disable-next-line no-await-in-loop
    if (!data || (await upload(id, data))) p.delete(id);
  }
  savePending(p);
}

/* ---------- Lecture des fichiers choisis par l'utilisateur ---------- */
/** Réduit une photo (JPEG) pour la stocker légèrement. */
export function compressPhoto(file, maxSide = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible.'));
    };
    img.src = url;
  });
}

/** Photo recompressée ou PDF tel quel (4 Mo maximum) → data URL. */
export function readUserFile(file, maxBytes = 4 * 1024 * 1024) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > maxBytes) return Promise.reject(new Error(`PDF trop lourd (max ${Math.round(maxBytes / 1024 / 1024)} Mo).`));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*/, 'data:application/pdf'));
      reader.onerror = () => reject(new Error('Fichier illisible.'));
      reader.readAsDataURL(file);
    });
  }
  if (file.type.startsWith('image/') || /\.(heic|jpe?g|png|webp)$/i.test(file.name)) return compressPhoto(file);
  return Promise.reject(new Error('Formats acceptés : photo ou PDF.'));
}

/** Ouvre un fichier : photo en grand, PDF dans un nouvel onglet (aperçu natif sur iPhone). */
export async function openFile(id, name, { lightbox }) {
  const data = await getFile(id);
  if (!data) throw new Error('Fichier introuvable (hors ligne ?).');
  if (data.startsWith('data:image/')) return lightbox(data, name);
  const blob = await (await fetch(data)).blob();
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

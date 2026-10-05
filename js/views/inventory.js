/* Inventaire des biens de valeur (pour l'assurance) : photo, facture, valeur, garantie ; export imprimable. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { daysUntil } from '../core/calc.js';
import { INVENTORY_CATEGORIES, INVENTORY_ICONS, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog, openPhotoLightbox } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { saveFile, deleteFile, getFile, readUserFile, compressPhoto } from '../services/files.js';
import { euro, euroRound, toNumber, numInput, positive } from './common.js';
import { openDoc } from './docs.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'short', year: 'numeric' });
const valueOf = i => i.value || i.price;

let groupBy = 'room';
let photo = null; // { id, data?, removed? } du formulaire
const thumbs = new Map(); // id photo -> data URL (cache d'affichage)

async function loadThumbs(items) {
  const missing = items.filter(i => i.photoId && !thumbs.has(i.photoId));
  if (!missing.length) return;
  await Promise.all(missing.map(async i => thumbs.set(i.photoId, (await getFile(i.photoId).catch(() => null)) || '')));
  renderInventory();
}

function row(i) {
  const src = i.photoId ? thumbs.get(i.photoId) : '';
  const warranty = i.warrantyEnd ? daysUntil(i.warrantyEnd) : null;
  const sub = [i.brand && i.model ? `${i.brand} ${i.model}` : i.brand || i.model, groupBy === 'room' ? i.category : i.room, i.purchaseDate ? fmtDate(i.purchaseDate) : ''].filter(Boolean).join(' · ');
  return `<div class="row inv-row" data-edit data-item="${esc(i.id)}">
    ${src ? `<button type="button" class="inv-thumb" data-item-photo><img src="${src}" alt=""></button>` : `<span class="row__icon">${icon(INVENTORY_ICONS[i.category] || 'archive', 18)}</span>`}
    <div class="row__body"><span class="row__title">${esc(i.name)}</span><span class="row__sub">${esc(sub || ' ')}</span>
      ${warranty !== null ? `<span class="row__tags"><span class="level is-${warranty < 0 ? 'none' : warranty <= 60 ? 'soon' : 'ok'}">${warranty < 0 ? 'Hors garantie' : `Garantie → ${fmtDate(i.warrantyEnd)}`}</span></span>` : ''}</div>
    <div class="row__amount">${valueOf(i) ? esc(euroRound(valueOf(i))) : '—'}${i.value && i.price && i.value !== i.price ? `<small>achat ${esc(euroRound(i.price))}</small>` : ''}</div>
  </div>`;
}

export function renderInventory() {
  const items = store.get('inventory');
  const total = items.reduce((s, i) => s + valueOf(i), 0);
  const purchase = items.reduce((s, i) => s + i.price, 0);
  const noProof = items.filter(i => !i.photoId).length;
  $('#inventoryHero').innerHTML = `
    <div class="cost-hero__label">Valeur des biens</div>
    <div class="cost-hero__value">${esc(euroRound(total))}</div>
    <p class="cost-hero__note">${items.length} objet${items.length > 1 ? 's' : ''}${purchase ? ` · ${esc(euroRound(purchase))} à l’achat` : ''}${noProof ? ` · ${noProof} sans photo` : ''}</p>`;
  $('#inventoryGroup').querySelectorAll('[data-group]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.group === groupBy)));
  const groups = new Map();
  items
    .sort((a, b) => valueOf(b) - valueOf(a))
    .forEach(i => {
      const k = (groupBy === 'room' ? i.room : i.category) || 'Sans pièce';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    });
  $('#inventoryList').innerHTML = items.length
    ? [...groups]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, list]) => `<div class="list-year"><span>${esc(k)}</span><b>${esc(euro(list.reduce((s, i) => s + valueOf(i), 0)))}</b></div>${list.map(row).join('')}`)
        .join('')
    : `<div class="empty-state"><span class="empty-state__icon">${icon('archive', 22)}</span><p>Listez vos biens de valeur (TV, électroménager, bijoux, vélos, outillage…) avec photo et facture : précieux pour l’assurance en cas de sinistre ou de vol.</p></div>`;
  $('#inventoryExport').hidden = !items.length;
  loadThumbs(items);
}

/* ---------- Fiche ---------- */
function renderPhoto() {
  const data = photo?.data || (photo?.id && !photo.removed ? thumbs.get(photo.id) : '');
  $('#invPhoto').innerHTML = data ? `<img src="${data}" alt="">` : `<span class="photo-picker__empty">${icon('image', 26)}<strong>Ajouter une photo</strong><span>Objet, étiquette ou numéro de série</span></span>`;
  $('#invPhotoRemove').hidden = !data;
}

export function openItem(id = null) {
  const i = id ? store.get('inventory').find(x => x.id === id) : null;
  const form = $('#inventoryForm');
  form.reset();
  clearErrors(form);
  form.elements.category.innerHTML = INVENTORY_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');
  $('#invRooms').innerHTML = [...new Set(store.get('inventory').map(x => x.room).filter(Boolean).concat(['Salon', 'Cuisine', 'Chambre', 'Bureau', 'Garage', 'Cave', 'Extérieur']))].map(r => `<option value="${esc(r)}">`).join('');
  form.elements.editId.value = i?.id || '';
  ['name', 'room', 'brand', 'model', 'serial', 'purchaseDate', 'warrantyEnd', 'note'].forEach(k => (form.elements[k].value = i?.[k] || ''));
  form.elements.category.value = i?.category || 'Électroménager';
  form.elements.price.value = i ? numInput(i.price) : '';
  form.elements.value.value = i ? numInput(i.value) : '';
  photo = i?.photoId ? { id: i.photoId } : null;
  renderPhoto();
  $('#inventoryTitle').textContent = i ? 'Modifier l’objet' : 'Nouvel objet';
  $('#inventoryDelete').hidden = !i;
  openSheet('inventorySheet', { focus: false });
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, {
    name: [rules.required('Le nom'), rules.maxLength(80)],
    room: [rules.maxLength(60)],
    purchaseDate: [rules.date()],
    warrantyEnd: [rules.date()],
    price: [positive('Le prix')],
    value: [positive('La valeur')],
    note: [rules.maxLength(500)]
  });
  if (!valid) return showErrors(form, errors);
  const existing = val.editId ? store.get('inventory').find(x => x.id === val.editId) : null;
  let photoId = existing?.photoId || '';
  try {
    if (photo?.data) {
      if (photoId) deleteFile(photoId);
      photoId = makeId();
      await saveFile(photoId, photo.data);
      thumbs.set(photoId, photo.data);
    } else if (!photo && photoId) {
      deleteFile(photoId);
      photoId = '';
    }
  } catch (error) {
    return toastError(`Photo non enregistrée : ${error.message}`);
  }
  store.upsert('inventory', {
    id: existing?.id || makeId(),
    name: val.name,
    category: val.category,
    room: val.room,
    brand: val.brand,
    model: val.model,
    serial: val.serial,
    purchaseDate: val.purchaseDate,
    price: toNumber(val.price) || 0,
    value: toNumber(val.value) || 0,
    warrantyEnd: val.warrantyEnd,
    photoId,
    note: val.note
  });
  closeSheet('inventorySheet');
  toast(existing ? 'Objet modifié' : 'Objet ajouté à l’inventaire');
}

async function remove() {
  const id = $('#inventoryForm').elements.editId.value;
  const i = store.get('inventory').find(x => x.id === id);
  if (!i || !(await confirmDialog({ title: `Supprimer « ${i.name} » ?`, confirmLabel: 'Supprimer', danger: true }))) return;
  if (i.photoId) deleteFile(i.photoId);
  store.remove('inventory', id);
  closeSheet('inventorySheet');
  toast('Objet supprimé');
}

/* ---------- Export imprimable (à remettre à l'assureur) ---------- */
async function exportInventory() {
  const win = window.open('', '_blank');
  if (!win) return toastError('Autorisez l’ouverture d’une nouvelle fenêtre pour exporter.');
  const items = store.get('inventory').sort((a, b) => (a.room || '').localeCompare(b.room || '') || valueOf(b) - valueOf(a));
  const home = store.home();
  const photos = await Promise.all(items.map(i => (i.photoId ? getFile(i.photoId).catch(() => '') : '')));
  const total = items.reduce((s, i) => s + valueOf(i), 0);
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inventaire — ${esc(home?.name || 'Ma maison')}</title>
  <style>body{font:14px -apple-system,system-ui,sans-serif;color:#111;margin:24px}h1{font-size:22px;margin:0}p{color:#555;margin:4px 0 16px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px 6px;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#666}td.n{text-align:right;white-space:nowrap}img{width:72px;height:72px;object-fit:cover;border-radius:8px}tfoot td{font-weight:700}button{margin:0 0 16px;padding:10px 16px;font:inherit;border-radius:10px;border:1px solid #999;background:#f4f4f4}@media print{button{display:none}}</style></head><body>
  <button onclick="print()">Imprimer / Enregistrer en PDF</button>
  <h1>Inventaire des biens — ${esc(home?.name || 'Ma maison')}</h1><p>${esc(home?.address || '')} · établi le ${esc(formatKey(todayKey(), { day: 'numeric', month: 'long', year: 'numeric' }))} · ${items.length} objets</p>
  <table><thead><tr><th>Photo</th><th>Objet</th><th>Pièce</th><th>Achat</th><th>N° de série</th><th class="n">Prix</th><th class="n">Valeur</th></tr></thead><tbody>
  ${items.map((i, k) => `<tr><td>${photos[k] ? `<img src="${photos[k]}" alt="">` : ''}</td><td><b>${esc(i.name)}</b><br>${esc([i.category, i.brand, i.model].filter(Boolean).join(' · '))}</td><td>${esc(i.room)}</td><td>${i.purchaseDate ? esc(fmtDate(i.purchaseDate)) : ''}</td><td>${esc(i.serial)}</td><td class="n">${i.price ? esc(euro(i.price)) : ''}</td><td class="n">${esc(euro(valueOf(i)))}</td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="6">Total</td><td class="n">${esc(euro(total))}</td></tr></tfoot></table></body></html>`);
  win.document.close();
}

export function initInventory() {
  $('#inventoryForm').addEventListener('submit', onSubmit);
  $('#inventoryDelete').addEventListener('click', remove);
  $('#inventoryExport').addEventListener('click', exportInventory);
  $('#invInvoice').addEventListener('click', () => {
    const f = $('#inventoryForm');
    openDoc(null, { type: 'Facture', title: f.elements.name.value ? `Facture ${f.elements.name.value}` : '' });
  });
  $('#invPhotoInput').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      photo = { ...(photo || {}), data: await (file.type.startsWith('image/') ? compressPhoto(file, 1200, 0.78) : readUserFile(file)) };
      if (!photo.data.startsWith('data:image/')) throw new Error('Choisissez une photo.');
      renderPhoto();
    } catch (error) {
      photo = null;
      toastError(error.message);
    }
  });
  $('#invPhotoRemove').addEventListener('click', () => {
    photo = null;
    renderPhoto();
  });
  $('#inventoryGroup').addEventListener('click', e => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    groupBy = b.dataset.group;
    renderInventory();
  });
  $('#inventoryList').addEventListener('click', e => {
    const r = e.target.closest('[data-item]');
    if (!r) return;
    if (e.target.closest('[data-item-photo]')) {
      const img = r.querySelector('img');
      return img && openPhotoLightbox(img.src, '');
    }
    openItem(r.dataset.item);
  });
}

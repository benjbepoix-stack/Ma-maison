/* Documents : factures, garanties, diagnostics, acte… avec pièces jointes (photos, PDF). */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { daysUntil } from '../core/calc.js';
import { DOC_TYPES, MAX_FILES, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog, openPhotoLightbox } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { saveFile, deleteFile, readUserFile, openFile } from '../services/files.js';
import { euro, toNumber, numInput, positive } from './common.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'short', year: 'numeric' });
const TYPE_ICON = { 'Acte de vente': 'key', Facture: 'wallet', Garantie: 'shield', Devis: 'calculator', 'Diagnostic (DPE…)': 'leaf', Assurance: 'shield', Plan: 'ruler', Notice: 'info', 'Urbanisme / permis': 'building', Impôts: 'coins', Crédit: 'piggy', Autre: 'doc' };
export const SOON_EXPIRY_DAYS = 60;

let filter = '';
let query = '';
let pending = []; // pièces jointes du formulaire : { id, name, mime, data? (nouvelle) }
let removed = [];

/** Statut d'échéance (fin de garantie, renouvellement). */
export function expiryLevel(d, today = todayKey()) {
  if (!d.expiry) return null;
  const days = daysUntil(d.expiry, today);
  return { days, level: days < 0 ? 'late' : days <= SOON_EXPIRY_DAYS ? 'soon' : 'ok' };
}

export const openAttachment = f => openFile(f.id, f.name, { lightbox: openPhotoLightbox }).catch(error => toastError(error.message));

function row(d) {
  const e = expiryLevel(d);
  const n = d.files.length;
  const sub = [d.type, d.date ? fmtDate(d.date) : '', d.amount ? euro(d.amount) : ''].filter(Boolean).join(' · ');
  const expiry = e ? `<span class="row__tags"><span class="level is-${e.level}">${e.level === 'late' ? `Expiré le ${fmtDate(d.expiry)}` : `${d.type === 'Garantie' ? 'Garantie jusqu’au' : 'Échéance le'} ${fmtDate(d.expiry)}`}</span></span>` : '';
  return `<div class="row" data-edit data-doc="${esc(d.id)}">
    <span class="row__icon">${icon(TYPE_ICON[d.type] || 'doc', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(d.title || d.type)}</span><span class="row__sub">${esc(sub)}</span>${expiry}</div>
    ${n ? `<button type="button" class="icon-btn icon-btn--sm" data-doc-file aria-label="${n > 1 ? `Voir les pièces jointes (${n})` : 'Voir la pièce jointe'}">${icon('paperclip', 17)}${n > 1 ? `<span class="icon-btn__badge">${n}</span>` : ''}</button>` : ''}
  </div>`;
}

export function renderDocs() {
  const docs = store.get('docs');
  const types = DOC_TYPES.filter(t => docs.some(d => d.type === t));
  if (filter && !types.includes(filter)) filter = '';
  $('#docFilters').innerHTML = docs.length
    ? [['', `Tous (${docs.length})`], ...types.map(t => [t, t])].map(([v, l]) => `<button type="button" class="scenario-chip" data-doc-filter="${esc(v)}" aria-pressed="${v === filter}">${esc(l)}</button>`).join('')
    : '';
  const q = query.trim().toLowerCase();
  const shown = docs
    .filter(d => (!filter || d.type === filter) && (!q || `${d.title} ${d.type} ${d.note}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title));
  const soon = docs.filter(d => ['late', 'soon'].includes(expiryLevel(d)?.level)).length;
  $('#docsSub').textContent = docs.length ? `${docs.length} document${docs.length > 1 ? 's' : ''}${soon ? ` · ${soon} échéance${soon > 1 ? 's' : ''} proche${soon > 1 ? 's' : ''}` : ''}` : 'Acte, factures, garanties, diagnostics…';
  $('#docSearch').hidden = docs.length < 6;
  $('#docList').innerHTML = shown.length
    ? shown.map(row).join('')
    : `<div class="empty-state"><span class="empty-state__icon">${icon('doc', 22)}</span><p>${docs.length ? 'Aucun document ne correspond.' : 'Ajoutez l’acte de vente, les factures des travaux, les garanties des appareils, le DPE… avec leurs photos ou PDF.'}</p></div>`;
}

function renderPending() {
  $('#docFilesList').innerHTML = pending
    .map(
      (f, i) => `<div class="file-attach__current" data-file-index="${i}">
        <span class="file-attach__icon">${icon(f.mime.startsWith('image/') ? 'image' : 'doc', 16)}</span>
        <span class="file-attach__name">${esc(f.name || 'Fichier')}</span>
        <button type="button" class="icon-btn icon-btn--sm" data-file-remove="${i}" aria-label="Retirer">${icon('close', 16)}</button>
      </div>`
    )
    .join('');
  $('#docFileBtnLabel').textContent = pending.length ? 'Ajouter d’autres fichiers' : 'Ajouter photos ou PDF';
}

export function openDoc(id = null, preset = {}) {
  const d = id ? store.get('docs').find(x => x.id === id) : null;
  const form = $('#docForm');
  form.reset();
  clearErrors(form);
  form.elements.type.innerHTML = DOC_TYPES.map(t => `<option>${esc(t)}</option>`).join('');
  form.elements.editId.value = d?.id || '';
  form.elements.type.value = d?.type || preset.type || 'Facture';
  form.elements.title.value = d?.title || preset.title || '';
  form.elements.date.value = d?.date || todayKey();
  form.elements.expiry.value = d?.expiry || '';
  form.elements.amount.value = d ? numInput(d.amount) : '';
  form.elements.note.value = d?.note || '';
  pending = d ? d.files.map(f => ({ ...f })) : [];
  removed = [];
  renderPending();
  $('#docTitle').textContent = d ? 'Modifier le document' : 'Nouveau document';
  $('#docDelete').hidden = !d;
  openSheet('docSheet', { focus: false });
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, { title: [rules.required('Le titre'), rules.maxLength(120)], date: [rules.date()], expiry: [rules.date()], amount: [positive('Le montant')], note: [rules.maxLength(1000)] });
  if (!valid) return showErrors(form, errors);
  const btn = form.querySelector('[type="submit"]');
  btn.classList.add('is-loading');
  try {
    // Fichiers : les nouveaux sont enregistrés à part (local + cloud), les retirés supprimés.
    await Promise.all(pending.filter(f => f.data).map(f => saveFile(f.id, f.data)));
    removed.forEach(fid => deleteFile(fid));
    const files = pending.map(({ id, name, mime }) => ({ id, name, mime }));
    store.upsert('docs', { id: val.editId || makeId(), type: val.type, title: val.title, date: val.date, expiry: val.expiry, amount: toNumber(val.amount) || 0, note: val.note, files });
    closeSheet('docSheet');
    toast(val.editId ? 'Document modifié' : 'Document ajouté');
  } catch (error) {
    toastError(`Enregistrement impossible : ${error.message}`);
  } finally {
    btn.classList.remove('is-loading');
  }
}

async function remove() {
  const id = $('#docForm').elements.editId.value;
  const d = store.get('docs').find(x => x.id === id);
  if (!d || !(await confirmDialog({ title: 'Supprimer ce document ?', message: `${d.title} et ses pièces jointes`, confirmLabel: 'Supprimer', danger: true }))) return;
  d.files.forEach(f => deleteFile(f.id));
  store.remove('docs', id);
  closeSheet('docSheet');
  toast('Document supprimé');
}

export function initDocs() {
  $('#docForm').addEventListener('submit', onSubmit);
  $('#docDelete').addEventListener('click', remove);
  $('#docFileInput').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    const room = MAX_FILES - pending.length;
    const errors = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await readUserFile(file);
        pending.push({ id: makeId(), name: file.name, mime: data.slice(5, data.indexOf(';')), data });
      } catch (error) {
        errors.push(`${file.name} : ${error.message}`);
      }
    }
    if (files.length > room) errors.push(`${MAX_FILES} fichiers maximum par document.`);
    renderPending();
    if (errors.length) toastError(errors.join(' '));
    e.target.value = '';
  });
  $('#docFilesList').addEventListener('click', e => {
    const rm = e.target.closest('[data-file-remove]');
    if (rm) {
      const [f] = pending.splice(Number(rm.dataset.fileRemove), 1);
      if (f && !f.data) removed.push(f.id);
      return renderPending();
    }
    const pill = e.target.closest('[data-file-index]');
    const f = pill && pending[Number(pill.dataset.fileIndex)];
    if (!f) return;
    if (f.data) {
      if (f.data.startsWith('data:image/')) openPhotoLightbox(f.data, f.name);
      else window.open(f.data, '_blank');
    } else openAttachment(f);
  });
  $('#docSearch').addEventListener('input', e => {
    query = e.target.value;
    renderDocs();
  });
  $('#docsPanel').addEventListener('click', e => {
    const chip = e.target.closest('[data-doc-filter]');
    if (chip) {
      filter = chip.dataset.docFilter;
      return renderDocs();
    }
    const r = e.target.closest('[data-doc]');
    if (!r) return;
    const d = store.get('docs').find(x => x.id === r.dataset.doc);
    if (d && e.target.closest('[data-doc-file]')) return d.files.length === 1 ? openAttachment(d.files[0]) : openDoc(d.id);
    openDoc(r.dataset.doc);
  });
}

export const docTitle = id => store.get('docs').find(d => d.id === id)?.title || '';

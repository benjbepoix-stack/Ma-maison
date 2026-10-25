/* Entretien : plan d'entretien périodique (rappels) et historique des interventions. */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { reminderAlerts, dueText } from '../core/calc.js';
import { CATEGORIES, CATEGORY_ICONS, COMMON_REMINDERS, HEATING_REMINDERS, EXTRA_SUGGESTIONS, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { createFileField, openAttachment } from '../ui/file-field.js';
import { bindSwipe } from '../ui/swipe.js';
import { deleteFile } from '../services/files.js';
import { euro, toNumber, numInput, positive, LEVEL_LABEL } from './common.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'short', year: 'numeric' });
let invoiceField = null;
/** Facture rangée dans les documents pour une intervention (document « Facture » relié). */
const invoiceOf = id => store.get('docs').find(d => d.source === 'maintenance' && d.sourceId === id) || null;
const categoryOptions = () => CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');
const suggestions = () => [...new Set([...Object.values(HEATING_REMINDERS).flat(), ...COMMON_REMINDERS].map(r => r.label).concat(EXTRA_SUGGESTIONS))];
/** Préréglage connu pour un nom (catégorie et périodicité proposées). */
const presetFor = label => [...Object.values(HEATING_REMINDERS).flat(), ...COMMON_REMINDERS].find(r => r.label.toLowerCase() === label.trim().toLowerCase());

const tile = (r, level = '') => `<span class="tile${level ? ` is-${level}` : ''}" aria-hidden="true">${icon(CATEGORY_ICONS[r.category] || 'wrench', 20)}</span>`;

/** Ligne « À faire » (comme Mon Garage) : glisser vers la droite ouvre « Noter l'intervention ». */
const todoRow = r => `<div class="sw" data-reminder-swipe="${esc(r.id)}" data-reminder="${esc(r.id)}">
    <div class="sw__under" aria-hidden="true"><span class="sw__check">${icon('check', 22)}</span><span>Noter l’intervention</span></div>
    <div class="sw__front trow" tabindex="0" role="button" aria-label="${esc(r.label)} : noter l’intervention">${tile(r, r.status.level)}
      <span class="row__body"><span class="row__title">${esc(r.label)}</span><span class="row__sub">${esc(dueText(r.status))}</span></span>
      <span class="badge is-${r.status.level}">${LEVEL_LABEL[r.status.level]}</span></div>
  </div>`;

/** Ligne du plan d'entretien : fréquence, prochaine échéance ; la coche note l'intervention. */
function reminderRow(r) {
  const s = r.status;
  const every = r.everyMonths ? `Tous les ${r.everyMonths} mois` : 'Sans périodicité';
  const when = s.nextDate ? `${s.level === 'late' ? 'Prévu le' : 'Prochain :'} ${fmtDate(s.nextDate)}` : r.lastDate ? '' : 'Dernière fois à renseigner';
  return `<div class="row" data-reminder="${esc(r.id)}">
    ${tile(r, s.level === 'unknown' || s.level === 'none' ? '' : s.level)}
    <button type="button" class="row__body" data-reminder-edit aria-label="Modifier le rappel ${esc(r.label)}"><span class="row__title">${esc(r.label)}</span><span class="row__sub">${esc([when, every].filter(Boolean).join(' · '))}</span></button>
    <button type="button" class="icon-btn icon-btn--sm row__done" data-reminder-done aria-label="${esc(r.label)} : c’est fait" title="Fait">${icon('check', 16)}</button>
  </div>`;
}

function maintenanceRow(x) {
  const sub = [fmtDate(x.date), x.category, x.provider].filter(Boolean).join(' · ');
  const n = invoiceOf(x.id)?.files.length || 0;
  return `<div class="row" data-edit data-maintenance="${esc(x.id)}">
    <span class="row__icon">${icon(CATEGORY_ICONS[x.category] || 'wrench', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(x.label || x.category)}</span><span class="row__sub">${esc(sub)}</span></div>
    ${n ? `<button type="button" class="icon-btn icon-btn--sm" data-invoice aria-label="Voir la facture" title="Facture">${icon('paperclip', 16)}${n > 1 ? `<span class="icon-btn__badge">${n}</span>` : ''}</button>` : ''}
    <div class="row__amount">${x.cost ? esc(euro(x.cost)) : '—'}</div>
  </div>`;
}

export function renderMaintenance() {
  const reminders = reminderAlerts(store.get('reminders'));
  const late = reminders.filter(r => r.status.level === 'late').length;
  const todo = reminders.filter(r => r.status.level === 'late' || r.status.level === 'soon');
  $('#reminderSub').textContent = reminders.length ? `${reminders.length} rappel${reminders.length > 1 ? 's' : ''}${late ? ` · ${late} en retard` : ''}` : 'Rappels périodiques';
  $('#todoSection').hidden = !todo.length;
  $('#todoCount').textContent = todo.length || '';
  $('#todoList').innerHTML = todo.map(todoRow).join('');
  $$('#todoList .sw').forEach(el => bindSwipe(el, () => openMaintenance(null, { reminderId: el.dataset.reminderSwipe })));
  $('#reminderList').innerHTML = reminders.length
    ? reminders.map(reminderRow).join('')
    : `<div class="empty-state"><p>Aucun rappel. Renseignez la fiche de la maison pour pré-remplir le plan d’entretien, ou ajoutez par exemple l’entretien de la chaudière tous les 12 mois.</p></div>`;

  const items = store.get('maintenance').sort((a, b) => b.date.localeCompare(a.date));
  const year = todayKey().slice(0, 4);
  const yearTotal = items.filter(x => x.date.startsWith(year)).reduce((s, x) => s + x.cost, 0);
  $('#maintenanceSub').textContent = items.length ? `${items.length} intervention${items.length > 1 ? 's' : ''} · ${euro(yearTotal)} en ${year}` : '';
  // Regroupement par année : en-tête avec le total de l'année.
  const byYear = new Map();
  items.forEach(x => {
    const y = x.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(x);
  });
  $('#maintenanceList').innerHTML = items.length
    ? [...byYear]
        .map(([y, list]) => `<div class="list-year"><span>${y}</span><b>${esc(euro(list.reduce((s, x) => s + x.cost, 0)))}</b></div>${list.map(maintenanceRow).join('')}`)
        .join('')
    : '<div class="empty-state"><p>Aucune intervention enregistrée.</p></div>';
}

/* ---------- Intervention ---------- */
export function openMaintenance(id = null, { reminderId = '' } = {}) {
  const x = id ? store.get('maintenance').find(m => m.id === id) : null;
  const reminders = store.get('reminders');
  const reminder = reminders.find(r => r.id === reminderId);
  const form = $('#maintenanceForm');
  form.reset();
  clearErrors(form);
  form.elements.category.innerHTML = categoryOptions();
  $('#maChoices').innerHTML = suggestions().map(t => `<option value="${esc(t)}">`).join('');
  form.elements.editId.value = x ? x.id : '';
  form.elements.label.value = x?.label || reminder?.label || '';
  form.elements.category.value = x?.category || reminder?.category || 'Chauffage';
  form.elements.date.value = x?.date || todayKey();
  form.elements.cost.value = x ? numInput(x.cost) : '';
  form.elements.provider.value = x?.provider || '';
  form.elements.note.value = x?.note || '';
  invoiceField.set(x ? invoiceOf(x.id)?.files : []);
  const preChecked = new Set(reminder ? [reminder.id] : []);
  $('#maReminderList').innerHTML = reminders
    .map(r => `<label class="check-row ${preChecked.has(r.id) ? 'is-checked' : ''}"><input type="checkbox" name="reminders" value="${esc(r.id)}" ${preChecked.has(r.id) ? 'checked' : ''}><span>${esc(r.label)}</span></label>`)
    .join('');
  $('#maReminderField').hidden = !reminders.length;
  $('#maintenanceTitle').textContent = x ? 'Modifier l’intervention' : 'Noter l’intervention';
  $('#maintenanceDelete').hidden = !x;
  openSheet('maintenanceSheet', { focus: false });
}

const maintenanceSchema = {
  label: [rules.required('L’intervention'), rules.maxLength(120)],
  date: [rules.date({ required: true })],
  cost: [positive('Le coût', { max: 10000000 })],
  provider: [rules.maxLength(80)],
  note: [rules.maxLength(1000)]
};

/**
 * Documents après enregistrement d'une intervention : sa facture (fichiers joints) est rangée
 * dans un document « Facture » relié, créé ou mis à jour. Sans fichier, ce document est retiré —
 * sauf s'il porte une information ajoutée à la main (échéance, note), conservée sans pièce jointe.
 */
function docsWithInvoice(item, files) {
  const docs = store.get('docs');
  const existing = invoiceOf(item.id);
  if (files.length) {
    const doc = { ...(existing || { id: makeId(), type: 'Facture', expiry: '', note: '', source: 'maintenance', sourceId: item.id }), title: item.label, date: item.date, amount: item.cost, files };
    return existing ? docs.map(d => (d.id === existing.id ? doc : d)) : [...docs, doc];
  }
  if (!existing) return docs;
  if (existing.expiry || existing.note) return docs.map(d => (d.id === existing.id ? { ...existing, files: [] } : d));
  return docs.filter(d => d.id !== existing.id);
}

async function onMaintenanceSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, maintenanceSchema);
  if (!valid) return showErrors(form, errors);
  const btn = form.querySelector('[type="submit"]');
  btn.classList.add('is-loading');
  try {
    const files = await invoiceField.commit();
    const list = store.get('maintenance');
    const existing = val.editId ? list.find(m => m.id === val.editId) : null;
    const item = { id: existing ? existing.id : makeId(), label: val.label, category: val.category, date: val.date, cost: toNumber(val.cost) || 0, provider: val.provider, note: val.note };
    const patch = { maintenance: existing ? list.map(m => (m === existing ? item : m)) : [...list, item], docs: docsWithInvoice(item, files) };
    // Remise à zéro des rappels cochés (si cette intervention est la plus récente pour chacun).
    const checked = new Set($$('#maReminderList input[name="reminders"]:checked').map(c => c.value));
    if (checked.size) patch.reminders = store.get('reminders').map(r => (checked.has(r.id) && (!r.lastDate || item.date >= r.lastDate) ? { ...r, lastDate: item.date } : r));
    store.setKeys(patch);
    closeSheet('maintenanceSheet');
    toast(existing ? 'Intervention modifiée' : files.length ? 'Intervention enregistrée · facture rangée dans les documents' : 'Intervention enregistrée');
  } catch (error) {
    toastError(`Enregistrement impossible : ${error.message}`);
  } finally {
    btn.classList.remove('is-loading');
  }
}

async function removeMaintenance() {
  const id = $('#maintenanceForm').elements.editId.value;
  const x = store.get('maintenance').find(m => m.id === id);
  const invoice = x && invoiceOf(x.id);
  if (!x || !(await confirmDialog({ title: 'Supprimer cette intervention ?', message: `${x.label} — ${fmtDate(x.date)}${invoice ? ' · sa facture sera aussi retirée des documents' : ''}`, confirmLabel: 'Supprimer', danger: true }))) return;
  if (invoice) invoice.files.forEach(f => deleteFile(f.id));
  store.setKeys({ maintenance: store.get('maintenance').filter(m => m.id !== id), docs: store.get('docs').filter(d => d.id !== invoice?.id) });
  closeSheet('maintenanceSheet');
  toast('Intervention supprimée');
}

/* ---------- Rappel ---------- */
export function openReminder(id = null) {
  const r = id ? store.get('reminders').find(x => x.id === id) : null;
  const form = $('#reminderForm');
  form.reset();
  clearErrors(form);
  form.elements.category.innerHTML = categoryOptions();
  $('#reChoices').innerHTML = suggestions().map(t => `<option value="${esc(t)}">`).join('');
  form.elements.editId.value = r ? r.id : '';
  form.elements.label.value = r?.label || '';
  form.elements.category.value = r?.category || 'Chauffage';
  form.elements.everyMonths.value = r?.everyMonths ? String(r.everyMonths) : '';
  form.elements.lastDate.value = r?.lastDate || '';
  form.elements.note.value = r?.note || '';
  $('#reminderTitle').textContent = r ? `Rappel · ${r.label}` : 'Nouveau rappel';
  $('#reminderDelete').hidden = !r;
  openSheet('reminderSheet', { focus: false });
}

const reminderSchema = {
  label: [rules.required('Le nom'), rules.maxLength(80)],
  everyMonths: [positive('La périodicité', { integer: true, max: 240, required: true })],
  lastDate: [rules.date(), v => (v && v > todayKey() ? 'Cette date est dans le futur.' : null)],
  note: [rules.maxLength(300)]
};

function onReminderSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, reminderSchema);
  if (!valid) return showErrors(form, errors);
  const item = { id: val.editId || makeId(), label: val.label, category: val.category, everyMonths: toNumber(val.everyMonths) || 0, lastDate: val.lastDate, note: val.note };
  store.upsert('reminders', item);
  closeSheet('reminderSheet');
  toast(val.editId ? 'Rappel modifié' : 'Rappel ajouté');
}

async function removeReminder() {
  const id = $('#reminderForm').elements.editId.value;
  const r = store.get('reminders').find(x => x.id === id);
  if (!r || !(await confirmDialog({ title: `Supprimer le rappel « ${r.label} » ?`, message: 'L’historique des interventions est conservé.', confirmLabel: 'Supprimer', danger: true }))) return;
  store.remove('reminders', id);
  closeSheet('reminderSheet');
  toast('Rappel supprimé');
}

export function initMaintenance() {
  invoiceField = createFileField({ list: '#maFilesList', input: '#maFileInput', label: '#maFileBtnLabel', empty: 'Joindre la facture', more: 'Ajouter un fichier' });
  $('#maintenanceForm').addEventListener('submit', onMaintenanceSubmit);
  $('#maintenanceDelete').addEventListener('click', removeMaintenance);
  $('#maReminderList').addEventListener('change', e => e.target.closest('.check-row')?.classList.toggle('is-checked', e.target.checked));
  $('#reminderForm').addEventListener('submit', onReminderSubmit);
  $('#reminderDelete').addEventListener('click', removeReminder);
  // Nom d'un rappel connu : catégorie et périodicité proposées automatiquement.
  $('#reLabel').addEventListener('change', e => {
    const form = $('#reminderForm');
    const p = presetFor(e.target.value);
    if (!p) return;
    form.elements.category.value = p.category;
    if (!form.elements.everyMonths.value) form.elements.everyMonths.value = String(p.everyMonths);
    if (!form.elements.note.value && p.note) form.elements.note.value = p.note;
  });
  $('#maLabel').addEventListener('change', e => {
    const p = presetFor(e.target.value);
    if (p) $('#maintenanceForm').elements.category.value = p.category;
  });
  $('#todoList').addEventListener('keydown', e => {
    const card = e.target.closest('[data-reminder]');
    if (card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openMaintenance(null, { reminderId: card.dataset.reminder });
    }
  });
  $('#maintenanceView').addEventListener('click', e => {
    const card = e.target.closest('[data-reminder]');
    if (card && e.target.closest('[data-reminder-done]')) return openMaintenance(null, { reminderId: card.dataset.reminder });
    if (card && e.target.closest('[data-reminder-edit]')) return openReminder(card.dataset.reminder);
    if (card && e.target.closest('.trow')) return openMaintenance(null, { reminderId: card.dataset.reminder });
    const row = e.target.closest('[data-maintenance]');
    if (row && e.target.closest('[data-invoice]')) {
      const files = invoiceOf(row.dataset.maintenance)?.files || [];
      if (files.length === 1) return openAttachment(files[0]);
    }
    if (row) openMaintenance(row.dataset.maintenance);
  });
}

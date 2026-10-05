/* Entretien : plan d'entretien périodique (rappels) et historique des interventions. */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { reminderAlerts, dueText } from '../core/calc.js';
import { CATEGORIES, CATEGORY_ICONS, COMMON_REMINDERS, HEATING_REMINDERS, EXTRA_SUGGESTIONS, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { euro, toNumber, numInput, positive, LEVEL_LABEL } from './common.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'short', year: 'numeric' });
const categoryOptions = () => CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');
const suggestions = () => [...new Set([...Object.values(HEATING_REMINDERS).flat(), ...COMMON_REMINDERS].map(r => r.label).concat(EXTRA_SUGGESTIONS))];
/** Préréglage connu pour un nom (catégorie et périodicité proposées). */
const presetFor = label => [...Object.values(HEATING_REMINDERS).flat(), ...COMMON_REMINDERS].find(r => r.label.toLowerCase() === label.trim().toLowerCase());

function reminderCard(r) {
  const s = r.status;
  const last = r.lastDate ? `Dernière fois : ${fmtDate(r.lastDate)}` : 'Touchez pour renseigner la dernière fois';
  return `<article class="due card is-${s.level}" data-reminder="${esc(r.id)}">
    <div class="due__head">
      <span class="row__icon">${icon(CATEGORY_ICONS[r.category] || 'wrench', 18)}</span>
      <button type="button" class="due__body" data-reminder-edit aria-label="Modifier le rappel ${esc(r.label)}"><span class="due__title">${esc(r.label)}</span><span class="due__sub">${r.everyMonths ? `Tous les ${r.everyMonths} mois` : 'Sans périodicité'} · ${esc(r.category)}</span></button>
      <span class="level is-${s.level}">${LEVEL_LABEL[s.level]}</span>
    </div>
    ${s.level === 'late' || s.level === 'soon' || s.level === 'ok' ? `<div class="due__bar"><span style="--value:${Math.round(s.ratio * 100)}%"></span></div>` : ''}
    <div class="due__foot"><span>${s.nextDate ? `Prochain : ${esc(fmtDate(s.nextDate))} · ${esc(dueText(s).toLowerCase())}` : esc(last)}</span>
      <div class="due__actions"><button type="button" class="icon-btn icon-btn--sm" data-reminder-done aria-label="Marquer comme fait" title="Fait">${icon('check', 16)}</button></div>
    </div>
    ${s.nextDate ? `<p class="due__sub">${esc(last)}</p>` : ''}
    ${r.note ? `<p class="due__note">${esc(r.note)}</p>` : ''}
  </article>`;
}

function maintenanceRow(x) {
  const sub = [fmtDate(x.date), x.category, x.provider].filter(Boolean).join(' · ');
  return `<div class="row" data-edit data-maintenance="${esc(x.id)}">
    <span class="row__icon">${icon(CATEGORY_ICONS[x.category] || 'wrench', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(x.label || x.category)}</span><span class="row__sub">${esc(sub)}</span></div>
    <div class="row__amount">${x.cost ? esc(euro(x.cost)) : '—'}</div>
  </div>`;
}

export function renderMaintenance() {
  const reminders = reminderAlerts(store.get('reminders'));
  const late = reminders.filter(r => r.status.level === 'late').length;
  $('#reminderSub').textContent = reminders.length ? `${reminders.length} rappel${reminders.length > 1 ? 's' : ''}${late ? ` · ${late} en retard` : ''}` : 'Rappels périodiques';
  $('#reminderList').innerHTML = reminders.length
    ? reminders.map(reminderCard).join('')
    : `<div class="empty-card">Aucun rappel. Renseignez la fiche de la maison pour pré-remplir le plan d’entretien, ou ajoutez par exemple l’entretien de la chaudière tous les 12 mois.</div>`;

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
  const preChecked = new Set(reminder ? [reminder.id] : []);
  $('#maReminderList').innerHTML = reminders
    .map(r => `<label class="check-row ${preChecked.has(r.id) ? 'is-checked' : ''}"><input type="checkbox" name="reminders" value="${esc(r.id)}" ${preChecked.has(r.id) ? 'checked' : ''}><span>${esc(r.label)}</span></label>`)
    .join('');
  $('#maReminderField').hidden = !reminders.length;
  $('#maintenanceTitle').textContent = x ? 'Modifier l’intervention' : 'Nouvelle intervention';
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

function onMaintenanceSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, maintenanceSchema);
  if (!valid) return showErrors(form, errors);
  const list = store.get('maintenance');
  const existing = val.editId ? list.find(m => m.id === val.editId) : null;
  const item = { id: existing ? existing.id : makeId(), label: val.label, category: val.category, date: val.date, cost: toNumber(val.cost) || 0, provider: val.provider, note: val.note };
  const patch = { maintenance: existing ? list.map(m => (m === existing ? item : m)) : [...list, item] };
  // Remise à zéro des rappels cochés (si cette intervention est la plus récente pour chacun).
  const checked = new Set($$('#maReminderList input[name="reminders"]:checked').map(c => c.value));
  if (checked.size) patch.reminders = store.get('reminders').map(r => (checked.has(r.id) && (!r.lastDate || item.date >= r.lastDate) ? { ...r, lastDate: item.date } : r));
  store.setKeys(patch);
  closeSheet('maintenanceSheet');
  toast(existing ? 'Intervention modifiée' : 'Intervention enregistrée');
}

async function removeMaintenance() {
  const id = $('#maintenanceForm').elements.editId.value;
  const x = store.get('maintenance').find(m => m.id === id);
  if (!x || !(await confirmDialog({ title: 'Supprimer cette intervention ?', message: `${x.label} — ${fmtDate(x.date)}`, confirmLabel: 'Supprimer', danger: true }))) return;
  store.remove('maintenance', id);
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
  $('#maintenanceView').addEventListener('click', e => {
    const card = e.target.closest('[data-reminder]');
    if (card && e.target.closest('[data-reminder-done]')) return openMaintenance(null, { reminderId: card.dataset.reminder });
    if (card && e.target.closest('[data-reminder-edit]')) return openReminder(card.dataset.reminder);
    const row = e.target.closest('[data-maintenance]');
    if (row) openMaintenance(row.dataset.maintenance);
  });
}

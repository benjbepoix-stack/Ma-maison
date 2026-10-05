/* Énergie & charges : factures ponctuelles et charges récurrentes (sans relevé de compteur). */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { chargesByMonth, chargesLast12, recurringMonthly } from '../core/calc.js';
import { CHARGE_CATEGORIES, CHARGE_ICONS, FREQUENCIES, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { renderBarChart, renderDonut, PALETTE } from '../ui/charts.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { euro, euroRound, euroShort, toNumber, numInput, positive } from './common.js';

const ENERGY = ['Électricité', 'Gaz', 'Eau', 'Fioul / bois'];
const TAXES = ['Taxe foncière', 'Assurance habitation', 'Ordures ménagères'];
const SHORT_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const colorOf = cat => PALETTE[CHARGE_CATEGORIES.indexOf(cat) % PALETTE.length];
const fmtDate = d => formatKey(d, { day: 'numeric', month: 'short', year: 'numeric' });

let year = Number(todayKey().slice(0, 4));

/** Taxe foncière annuelle connue (charges récurrentes, sinon dernière facture) — utilisée par l'analyse de revente. */
export function yearlyPropertyTax() {
  const rec = store.get('recurring').filter(r => r.category === 'Taxe foncière');
  if (rec.length) return rec.reduce((s, r) => s + recurringMonthly(r) * 12, 0);
  const bills = store.get('charges').filter(c => c.category === 'Taxe foncière').sort((a, b) => b.date.localeCompare(a.date));
  return bills[0]?.amount || 0;
}

function recurringRow(r) {
  return `<div class="row" data-edit data-recurring="${esc(r.id)}">
    <span class="row__icon">${icon(CHARGE_ICONS[r.category] || 'wallet', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(r.label || r.category)}</span><span class="row__sub">${esc([r.label ? r.category : '', r.provider, r.until && r.until < todayKey() ? `terminé le ${fmtDate(r.until)}` : ''].filter(Boolean).join(' · ') || ' ')}</span></div>
    <div class="row__amount">${esc(euro(r.amount))}<small>${esc(FREQUENCIES[r.frequency])}${r.frequency !== 'monthly' ? ` · ≈ ${euroRound(recurringMonthly(r))}/mois` : ''}</small></div>
  </div>`;
}

function chargeRow(c) {
  return `<div class="row" data-edit data-charge="${esc(c.id)}">
    <span class="row__icon">${icon(CHARGE_ICONS[c.category] || 'wallet', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(c.label || c.category)}</span><span class="row__sub">${esc([fmtDate(c.date), c.label ? c.category : '', c.provider].filter(Boolean).join(' · '))}</span></div>
    <div class="row__amount">${esc(euro(c.amount))}</div>
  </div>`;
}

export function renderCharges() {
  const charges = store.get('charges');
  const recurring = store.get('recurring');
  const last = chargesLast12(charges, recurring);
  const sumOf = cats => cats.reduce((s, c) => s + (last.byCategory[c] || 0), 0);
  $('#chargesHero').innerHTML = `
    <div class="cost-hero__label">Charges sur 12 mois</div>
    <div class="cost-hero__value">${esc(euroRound(last.total))}</div>
    <p class="cost-hero__note">≈ ${esc(euroRound(last.monthly))} par mois · factures et charges récurrentes</p>
    <div class="kpis">
      <div class="kpi"><span>Énergie & eau</span><strong>${esc(euroShort(sumOf(ENERGY)))}</strong></div>
      <div class="kpi"><span>Taxes & assurance</span><strong>${esc(euroShort(sumOf(TAXES)))}</strong></div>
      <div class="kpi"><span>Autres</span><strong>${esc(euroShort(last.total - sumOf(ENERGY) - sumOf(TAXES)))}</strong></div>
    </div>`;

  // Graphique mensuel de l'année choisie
  const months = chargesByMonth(charges, recurring, year);
  const cats = CHARGE_CATEGORIES.filter(c => months.some(m => m.byCategory[c]));
  $('#chargesYear').textContent = String(year);
  $('#chargesNewer').disabled = year >= Number(todayKey().slice(0, 4)) + 1;
  const yearTotal = months.reduce((s, m) => s + m.total, 0);
  $('#chargesYearSub').textContent = yearTotal ? `${euroRound(yearTotal)} sur l’année · charges récurrentes lissées au mois` : 'Aucune charge sur cette année';
  renderBarChart(
    $('#chargesChart'),
    months.map((m, i) => ({ key: m.month, label: SHORT_MONTHS[i].slice(0, 3), title: `${SHORT_MONTHS[i]} ${year}`, values: m.byCategory })),
    { bars: cats.map(c => ({ key: c, label: c, color: colorOf(c) })), stacked: true, fmt: euroRound, axisFmt: euroShort, highlight: todayKey().slice(0, 7) }
  );

  const entries = Object.entries(last.byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => [c, v, colorOf(c)]);
  renderDonut({ donut: $('#chargesDonut'), legend: $('#chargesLegend'), total: $('#chargesDonutTotal') }, entries, 'Ajoutez vos factures et charges récurrentes.', { format: euroShort });

  const active = recurring.filter(r => !r.until || r.until >= todayKey());
  $('#recurringSub').textContent = recurring.length ? `${active.length} active${active.length > 1 ? 's' : ''} · ≈ ${euroRound(active.reduce((s, r) => s + recurringMonthly(r), 0))} / mois` : 'Abonnements, assurance, mensualisations…';
  $('#recurringList').innerHTML = recurring.length
    ? recurring.sort((a, b) => recurringMonthly(b) - recurringMonthly(a)).map(recurringRow).join('')
    : '<div class="empty-state"><p>Ajoutez l’électricité mensualisée, l’assurance habitation, internet…</p></div>';

  const sorted = charges.sort((a, b) => b.date.localeCompare(a.date));
  const byYear = new Map();
  sorted.forEach(c => {
    const y = c.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(c);
  });
  $('#chargeSub').textContent = charges.length ? `${charges.length} facture${charges.length > 1 ? 's' : ''}` : 'Factures ponctuelles, taxe foncière, régularisations…';
  $('#chargeList').innerHTML = charges.length
    ? [...byYear].map(([y, list]) => `<div class="list-year"><span>${y}</span><b>${esc(euro(list.reduce((s, c) => s + c.amount, 0)))}</b></div>${list.map(chargeRow).join('')}`).join('')
    : '<div class="empty-state"><p>Aucune facture enregistrée.</p></div>';
}

/* ---------- Facture ---------- */
const categoryOptions = () => CHARGE_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');

export function openCharge(id = null) {
  const c = id ? store.get('charges').find(x => x.id === id) : null;
  const form = $('#chargeForm');
  form.reset();
  clearErrors(form);
  form.elements.category.innerHTML = categoryOptions();
  form.elements.editId.value = c?.id || '';
  form.elements.category.value = c?.category || 'Électricité';
  form.elements.label.value = c?.label || '';
  form.elements.date.value = c?.date || todayKey();
  form.elements.amount.value = c ? numInput(c.amount) : '';
  form.elements.provider.value = c?.provider || '';
  form.elements.note.value = c?.note || '';
  $('#chargeTitle').textContent = c ? 'Modifier la facture' : 'Nouvelle facture';
  $('#chargeDelete').hidden = !c;
  openSheet('chargeSheet', { focus: false });
}

function onChargeSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, { date: [rules.date({ required: true })], amount: [positive('Le montant', { required: true })], label: [rules.maxLength(80)], provider: [rules.maxLength(80)], note: [rules.maxLength(500)] });
  if (!valid) return showErrors(form, errors);
  store.upsert('charges', { id: val.editId || makeId(), category: val.category, label: val.label, date: val.date, amount: toNumber(val.amount) || 0, provider: val.provider, note: val.note });
  closeSheet('chargeSheet');
  toast(val.editId ? 'Facture modifiée' : 'Facture ajoutée');
}

/* ---------- Charge récurrente ---------- */
export function openRecurring(id = null) {
  const r = id ? store.get('recurring').find(x => x.id === id) : null;
  const form = $('#recurringForm');
  form.reset();
  clearErrors(form);
  form.elements.category.innerHTML = categoryOptions();
  form.elements.frequency.innerHTML = Object.entries({ monthly: 'Chaque mois', quarterly: 'Chaque trimestre', yearly: 'Chaque année' }).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  form.elements.editId.value = r?.id || '';
  form.elements.category.value = r?.category || 'Électricité';
  form.elements.label.value = r?.label || '';
  form.elements.amount.value = r ? numInput(r.amount) : '';
  form.elements.frequency.value = r?.frequency || 'monthly';
  form.elements.provider.value = r?.provider || '';
  form.elements.since.value = r?.since || '';
  form.elements.until.value = r?.until || '';
  $('#recurringTitle').textContent = r ? 'Modifier la charge' : 'Nouvelle charge récurrente';
  $('#recurringDelete').hidden = !r;
  openSheet('recurringSheet', { focus: false });
}

function onRecurringSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, {
    amount: [positive('Le montant', { required: true }), v => (toNumber(v) > 0 ? null : 'Montant supérieur à 0 attendu.')],
    label: [rules.maxLength(80)],
    provider: [rules.maxLength(80)],
    since: [rules.date()],
    until: [rules.date(), (v, all) => (v && all.since && v < all.since ? 'Fin avant le début.' : null)]
  });
  if (!valid) return showErrors(form, errors);
  store.upsert('recurring', { id: val.editId || makeId(), category: val.category, label: val.label, amount: toNumber(val.amount) || 0, frequency: val.frequency, provider: val.provider, since: val.since, until: val.until });
  closeSheet('recurringSheet');
  toast(val.editId ? 'Charge modifiée' : 'Charge ajoutée');
}

async function removeItem(key, formId, sheetId) {
  const id = $(formId).elements.editId.value;
  const item = store.get(key).find(x => x.id === id);
  if (!item || !(await confirmDialog({ title: 'Supprimer cette charge ?', message: item.label || item.category, confirmLabel: 'Supprimer', danger: true }))) return;
  store.remove(key, id);
  closeSheet(sheetId);
  toast('Charge supprimée');
}

export function initCharges() {
  $('#chargeForm').addEventListener('submit', onChargeSubmit);
  $('#recurringForm').addEventListener('submit', onRecurringSubmit);
  $('#chargeDelete').addEventListener('click', () => removeItem('charges', '#chargeForm', 'chargeSheet'));
  $('#recurringDelete').addEventListener('click', () => removeItem('recurring', '#recurringForm', 'recurringSheet'));
  $('#chargesOlder').addEventListener('click', () => {
    year--;
    renderCharges();
  });
  $('#chargesNewer').addEventListener('click', () => {
    year++;
    renderCharges();
  });
  $('#chargesPanel').addEventListener('click', e => {
    const r = e.target.closest('[data-recurring]');
    if (r) return openRecurring(r.dataset.recurring);
    const c = e.target.closest('[data-charge]');
    if (c) openCharge(c.dataset.charge);
  });
}

/* Travaux : projets chiffrés poste par poste (HT → TVA → imprévus → aides → reste à charge). */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { formatKey, todayKey } from '../core/dates.js';
import { workTotals, monthlySaving } from '../core/calc.js';
import { WORK_STATUS, WORK_PRIORITY, VAT_RATES, LINE_KINDS, UNITS, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { euro, euroRound, toNumber, numInput, positive, pct } from './common.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'short', year: 'numeric' });
const STATUS_TAG = { idea: '', quote: 'tag--info', planned: 'tag--info', ongoing: 'tag--warn', done: 'tag--ok' };
const KIND_ICON = { materials: 'paint', labour: 'hammer', other: 'list' };

let filter = 'active';
let openId = null; // projet affiché en détail
let navigate = () => {};

export const currentWork = () => (openId ? store.get('works').find(w => w.id === openId) || null : null);
export function showWork(id) {
  openId = id;
}

/* ---------- Liste ---------- */
function workCard(w) {
  const t = workTotals(w);
  const progress = t.budget ? Math.min(100, Math.round((t.spent / t.budget) * 100)) : 0;
  const meta = [w.room, w.targetDate ? `pour ${fmtDate(w.targetDate)}` : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="work-card card" data-work="${esc(w.id)}">
    <span class="work-card__head">
      <span class="row__icon">${icon('hammer', 18)}</span>
      <span class="work-card__text"><span class="work-card__name">${esc(w.name)}</span><span class="work-card__meta">${esc(meta || `${w.lines.length} poste${w.lines.length > 1 ? 's' : ''}`)}</span></span>
      <span class="work-card__amount">${esc(euroRound(t.net))}<small>reste à charge</small></span>
    </span>
    <span class="work-card__tags"><span class="tag ${STATUS_TAG[w.status]}">${esc(WORK_STATUS[w.status])}</span>${w.status !== 'done' ? `<span class="tag ${w.priority === 1 ? 'tag--danger' : ''}">${esc(WORK_PRIORITY[w.priority])}</span>` : ''}${t.aids ? `<span class="tag tag--ok">Aides ${esc(euroRound(t.aids))}</span>` : ''}</span>
    ${t.spent ? `<span class="due__bar"><span style="--value:${progress}%"></span></span>` : ''}
  </button>`;
}

function renderList() {
  const works = store.get('works');
  const active = works.filter(w => w.status !== 'done');
  const totals = active.map(workTotals);
  const sum = k => totals.reduce((s, t) => s + t[k], 0);
  const doneTotal = works.filter(w => w.status === 'done').reduce((s, w) => s + (w.spent || workTotals(w).net), 0);
  $('#worksHero').innerHTML = `
    <div class="cost-hero__label">Reste à charge des travaux à venir</div>
    <div class="cost-hero__value">${esc(euroRound(sum('net')))}</div>
    <p class="cost-hero__note">${active.length ? `${active.length} projet${active.length > 1 ? 's' : ''} · imprévus inclus` : 'Aucun projet en cours'}</p>
    <div class="kpis">
      <div class="kpi"><span>Budget TTC</span><strong>${esc(euroRound(sum('budget')))}</strong></div>
      <div class="kpi"><span>Aides</span><strong>${esc(euroRound(sum('aids')))}</strong></div>
      <div class="kpi"><span>Déjà réalisés</span><strong>${esc(euroRound(doneTotal))}</strong></div>
    </div>`;
  $$('#worksFilter [data-filter]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.filter === filter)));
  const shown = (filter === 'done' ? works.filter(w => w.status === 'done') : active).sort((a, b) => a.priority - b.priority || (a.targetDate || '9999').localeCompare(b.targetDate || '9999'));
  $('#workCards').innerHTML = shown.length
    ? shown.map(workCard).join('')
    : `<div class="empty-card">${filter === 'done' ? 'Aucun projet terminé pour l’instant.' : 'Aucun projet. Chiffrez par exemple une isolation, une salle de bain ou une terrasse : postes, TVA, imprévus et aides.'}</div>`;
}

/* ---------- Détail ---------- */
function lineRow(l) {
  return `<div class="row" data-edit data-line="${esc(l.id)}">
    <span class="row__icon">${icon(KIND_ICON[l.kind], 18)}</span>
    <div class="row__body"><span class="row__title">${esc(l.label)}</span><span class="row__sub">${esc(`${String(l.qty).replace('.', ',')} ${l.unit} × ${euro(l.unitPrice)} HT · ${LINE_KINDS[l.kind]}`)}</span></div>
    <div class="row__amount">${esc(euro(l.qty * l.unitPrice))}<small>HT</small></div>
  </div>`;
}

const fact = (label, value, cls = '') => `<div class="fact ${cls}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;

function renderDetail(w) {
  const t = workTotals(w);
  const saving = monthlySaving(w);
  const over = t.spent > t.budget && t.budget > 0;
  const progress = t.budget ? Math.min(100, Math.round((t.spent / t.budget) * 100)) : 0;
  const late = w.targetDate && w.targetDate < todayKey() && w.status !== 'done';
  $('#workDetail').innerHTML = `
    <section class="card cost-hero section--first">
      <div class="cost-hero__label">Reste à charge</div>
      <div class="cost-hero__value">${esc(euroRound(t.net))}</div>
      <p class="cost-hero__note">${esc([WORK_STATUS[w.status], w.room, w.targetDate ? `${late ? 'prévu le' : 'pour le'} ${fmtDate(w.targetDate)}` : ''].filter(Boolean).join(' · '))}</p>
      <div class="kpis">
        <div class="kpi"><span>Budget TTC</span><strong>${esc(euroRound(t.budget))}</strong></div>
        <div class="kpi"><span>Aides</span><strong>${esc(euroRound(t.aids))}</strong></div>
        <div class="kpi"><span>Dépensé</span><strong>${esc(euroRound(t.spent))}</strong></div>
      </div>
      ${t.spent ? `<div class="due__bar ${over ? 'is-over' : ''}"><span style="--value:${progress}%"></span></div><p class="cost-hero__note">${over ? `Dépassement de ${esc(euroRound(t.spent - t.budget))}` : `${progress} % du budget engagé`}</p>` : ''}
    </section>

    ${saving ? `<p class="saving-tip">${icon('piggy', 18)}<span>Pour être prêt à temps : <b>${esc(euroRound(saving.amount))} / mois</b> à mettre de côté pendant ${saving.months} mois.</span></p>` : ''}

    <section class="section">
      <header class="section__head"><div><h2 class="section__title">Postes</h2><p class="card__sub">${w.lines.length ? `${w.lines.length} poste${w.lines.length > 1 ? 's' : ''} · ${esc(euro(t.ht))} HT` : 'Matériaux, main-d’œuvre…'}</p></div><button type="button" class="add-btn" data-open="line" aria-label="Ajouter un poste"><span>${icon('plus', 18)}</span></button></header>
      <div class="card card--list">${w.lines.length ? w.lines.map(lineRow).join('') : '<div class="empty-state"><p>Ajoutez les postes du devis ou de votre estimation : quantité × prix unitaire.</p></div>'}</div>
    </section>

    <section class="section">
      <header class="section__head"><h2 class="section__title">Chiffrage</h2><button type="button" class="link-btn" data-work-edit>Modifier</button></header>
      <dl class="card card--list facts">
        ${t.byKind.materials ? fact('Matériaux HT', euro(t.byKind.materials)) : ''}
        ${t.byKind.labour ? fact('Main-d’œuvre HT', euro(t.byKind.labour)) : ''}
        ${t.byKind.other ? fact('Autre HT', euro(t.byKind.other)) : ''}
        ${fact('Total HT', euro(t.ht))}
        ${fact(`TVA ${pct(w.vat)}`, euro(t.vat))}
        ${fact('Total TTC', euro(t.ttc))}
        ${fact(`Imprévus ${pct(w.contingency, 0)}`, euro(t.contingency))}
        ${fact('Budget à prévoir', euro(t.budget))}
        ${t.aids ? fact('Aides', `− ${euro(t.aids)}`, 'fact--minus') : ''}
        ${fact('Reste à charge', euro(t.net), 'fact--total')}
      </dl>
    </section>
    ${w.note ? `<section class="section"><h2 class="section__title">Note</h2><p class="card note-card">${esc(w.note)}</p></section>` : ''}
    <button type="button" class="btn btn--soft btn--block section" data-work-edit>${icon('edit', 18)}<span>Modifier le projet</span></button>`;
}

export function renderWorks() {
  const w = currentWork();
  if (openId && !w) openId = null;
  $('#worksList').hidden = Boolean(w);
  $('#workDetail').hidden = !w;
  if (w) renderDetail(w);
  else renderList();
}

/* ---------- Projet (fiche) ---------- */
export function openWork(id = null) {
  const w = id ? store.get('works').find(x => x.id === id) : null;
  const form = $('#workForm');
  form.reset();
  clearErrors(form);
  form.elements.status.innerHTML = Object.entries(WORK_STATUS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  form.elements.priority.innerHTML = Object.entries(WORK_PRIORITY).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  form.elements.vat.innerHTML = VAT_RATES.map(v => `<option value="${v.value}">${esc(v.label)}</option>`).join('');
  form.elements.editId.value = w ? w.id : '';
  form.elements.name.value = w?.name || '';
  form.elements.room.value = w?.room || '';
  form.elements.targetDate.value = w?.targetDate || '';
  form.elements.status.value = w?.status || 'idea';
  form.elements.priority.value = String(w?.priority || 2);
  form.elements.vat.value = String(w ? w.vat : 10);
  form.elements.contingency.value = w ? numInput(w.contingency) : '10';
  form.elements.aids.value = w ? numInput(w.aids) : '';
  form.elements.spent.value = w ? numInput(w.spent) : '';
  form.elements.note.value = w?.note || '';
  $('#workTitle').textContent = w ? 'Modifier le projet' : 'Nouveau projet';
  $('#workDelete').hidden = !w;
  openSheet('workSheet', { focus: false });
}

const workSchema = {
  name: [rules.required('Le nom'), rules.maxLength(80)],
  room: [rules.maxLength(60)],
  targetDate: [rules.date()],
  contingency: [positive('La marge', { max: 100 })],
  aids: [positive('Les aides')],
  spent: [positive('Le montant')],
  note: [rules.maxLength(1000)]
};

function onWorkSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, workSchema);
  if (!valid) return showErrors(form, errors);
  const existing = val.editId ? store.get('works').find(w => w.id === val.editId) : null;
  const item = {
    id: existing?.id || makeId(),
    name: val.name,
    room: val.room,
    status: val.status,
    priority: Number(val.priority),
    targetDate: val.targetDate,
    vat: Number(val.vat),
    contingency: toNumber(val.contingency) || 0,
    aids: toNumber(val.aids) || 0,
    spent: toNumber(val.spent) || 0,
    note: val.note,
    lines: existing?.lines || []
  };
  store.upsert('works', item);
  closeSheet('workSheet');
  toast(existing ? 'Projet modifié' : 'Projet créé');
  if (!existing) navigate(item.id);
}

async function removeWork() {
  const id = $('#workForm').elements.editId.value;
  const w = store.get('works').find(x => x.id === id);
  if (!w || !(await confirmDialog({ title: `Supprimer « ${w.name} » ?`, message: 'Tous ses postes seront supprimés.', confirmLabel: 'Supprimer', danger: true }))) return;
  closeSheet('workSheet');
  store.remove('works', id);
  navigate(null);
  toast('Projet supprimé');
}

/* ---------- Poste ---------- */
export function openLine(id = null) {
  const w = currentWork();
  if (!w) return;
  const l = id ? w.lines.find(x => x.id === id) : null;
  const form = $('#lineForm');
  form.reset();
  clearErrors(form);
  form.elements.unit.innerHTML = UNITS.map(u => `<option>${esc(u)}</option>`).join('');
  form.elements.editId.value = l ? l.id : '';
  form.elements.label.value = l?.label || '';
  form.elements.kind.value = l?.kind || 'materials';
  form.elements.qty.value = l ? numInput(l.qty) : '1';
  form.elements.unit.value = l?.unit || 'u';
  form.elements.unitPrice.value = l ? numInput(l.unitPrice) : '';
  $('#lineTitle').textContent = l ? 'Modifier le poste' : 'Nouveau poste';
  $('#lineDelete').hidden = !l;
  updatePreview();
  openSheet('lineSheet', { focus: false });
}

function updatePreview() {
  const form = $('#lineForm');
  const w = currentWork();
  const ht = (toNumber(form.elements.qty.value) || 0) * (toNumber(form.elements.unitPrice.value) || 0);
  $('#linePreview').textContent = ht ? `${euro(ht)} HT · ${euro(ht * (1 + (w?.vat || 0) / 100))} TTC` : '';
}

const lineSchema = {
  label: [rules.required('Le poste'), rules.maxLength(80)],
  qty: [positive('La quantité', { required: true, max: 1000000 })],
  unitPrice: [positive('Le prix', { required: true, max: 10000000 })]
};

function onLineSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, lineSchema);
  if (!valid) return showErrors(form, errors);
  const w = currentWork();
  if (!w) return;
  const item = { id: val.editId || makeId(), label: val.label, kind: val.kind, qty: toNumber(val.qty) || 0, unit: val.unit, unitPrice: toNumber(val.unitPrice) || 0 };
  const lines = val.editId ? w.lines.map(l => (l.id === val.editId ? item : l)) : [...w.lines, item];
  store.upsert('works', { ...w, lines });
  closeSheet('lineSheet');
  toast(val.editId ? 'Poste modifié' : 'Poste ajouté');
}

async function removeLine() {
  const w = currentWork();
  const id = $('#lineForm').elements.editId.value;
  const l = w?.lines.find(x => x.id === id);
  if (!l || !(await confirmDialog({ title: `Supprimer « ${l.label} » ?`, confirmLabel: 'Supprimer', danger: true }))) return;
  store.upsert('works', { ...w, lines: w.lines.filter(x => x.id !== id) });
  closeSheet('lineSheet');
  toast('Poste supprimé');
}

export function initWorks({ onNavigate }) {
  navigate = onNavigate;
  $('#workForm').addEventListener('submit', onWorkSubmit);
  $('#workDelete').addEventListener('click', removeWork);
  $('#lineForm').addEventListener('submit', onLineSubmit);
  $('#lineDelete').addEventListener('click', removeLine);
  $('#lineForm').addEventListener('input', updatePreview);
  $('#worksFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    renderList();
  });
  $('#worksView').addEventListener('click', e => {
    const card = e.target.closest('[data-work]');
    if (card) return navigate(card.dataset.work);
    if (e.target.closest('[data-work-edit]')) return openWork(openId);
    const line = e.target.closest('[data-line]');
    if (line) openLine(line.dataset.line);
  });
}

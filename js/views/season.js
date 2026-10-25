/* Calendrier de saison : tâches du mois à cocher (par année), tâches perso, masquage. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey } from '../core/dates.js';
import { CATEGORIES, makeId } from '../core/schema.js';
import { relevantTasks, MONTH_NAMES } from '../core/season-tasks.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

/* Les quatre saisons, chacune trois mois (l'hiver chevauche la nouvelle année). */
export const SEASONS = [
  { id: 'printemps', name: 'Printemps', months: [3, 4, 5], range: 'mars à mai', caption: 'ce printemps' },
  { id: 'ete', name: 'Été', months: [6, 7, 8], range: 'juin à août', caption: 'cet été' },
  { id: 'automne', name: 'Automne', months: [9, 10, 11], range: 'sept. à nov.', caption: 'cet automne' },
  { id: 'hiver', name: 'Hiver', months: [12, 1, 2], range: 'déc. à févr.', caption: 'cet hiver' }
];
export const seasonOf = m => SEASONS.find(s => s.months.includes(m));
const nowMonth = () => Number(todayKey().slice(5, 7));

let picked = null;
let showHidden = false;
const year = () => todayKey().slice(0, 4);
const cap = s => s.replace(/^./, c => c.toUpperCase());

/** Tâches d'un mois (prédéfinies non masquées + perso), avec leur état pour l'année en cours. */
export function monthTasks(m = nowMonth(), { withHidden = false } = {}) {
  const season = store.get('season');
  const done = new Set(season.done[year()] || []);
  const hidden = new Set(season.hidden);
  const builtIn = relevantTasks(store.home())
    .filter(t => t.month === m)
    .map(t => ({ ...t, custom: false, hidden: hidden.has(t.id) }));
  const custom = season.custom.filter(t => t.month === m).map(t => ({ ...t, custom: true, hidden: false }));
  return [...builtIn, ...custom].filter(t => withHidden || !t.hidden).map(t => ({ ...t, done: done.has(t.id) }));
}

/** Avancement d'une saison : tâches visibles faites / total. */
export function seasonCount(s) {
  const tasks = s.months.flatMap(m => monthTasks(m));
  return { done: tasks.filter(t => t.done).length, total: tasks.length };
}

function taskRow(t) {
  return `<div class="row season-task ${t.done ? 'is-done' : ''} ${t.hidden ? 'is-hidden' : ''}" data-task="${esc(t.id)}" data-month="${t.month}">
    <label class="season-task__check"><input type="checkbox" data-task-toggle ${t.done ? 'checked' : ''} ${t.hidden ? 'disabled' : ''} aria-label="Fait"><span></span></label>
    <div class="row__body"><span class="row__title">${esc(t.label)}</span><span class="row__sub">${esc(t.category)}${t.custom ? ' · perso' : ''}</span></div>
    <button type="button" class="icon-btn icon-btn--sm" data-task-menu aria-label="${t.custom ? 'Supprimer' : t.hidden ? 'Réafficher' : 'Masquer'}" title="${t.custom ? 'Supprimer' : t.hidden ? 'Réafficher' : 'Masquer (ne concerne pas ma maison)'}">${icon(t.custom ? 'trash' : t.hidden ? 'refresh' : 'close', 16)}</button>
  </div>`;
}

/* ---------- La roue de l'année : janvier en haut, une saison par quart ---------- */
const R = 96;
const pt = deg => {
  const a = (deg * Math.PI) / 180;
  return `${(120 + R * Math.sin(a)).toFixed(1)} ${(120 - R * Math.cos(a)).toFixed(1)}`;
};
/** Angle (degrés) d'une date de l'année, janvier 1er = 0. */
const angleOf = (m, d = 1) => ((m - 1 + (d - 1) / 31) / 12) * 360;

function wheel(sel, current) {
  const arcs = SEASONS.map(s => {
    const a0 = angleOf(s.months[0]) + 3;
    const a1 = a0 + 84;
    return `<path class="wheel__arc" data-season="${s.id}" data-on="${s.id === sel.id}" d="M${pt(a0)}A${R} ${R} 0 0 1 ${pt(a1)}"/>`;
  }).join('');
  const [, m, d] = todayKey().split('-').map(Number);
  const [nx, ny] = pt(angleOf(m, d)).split(' ');
  const labels = [['janv.', 120, 13, 'middle'], ['avr.', 230, 124, 'start'], ['juil.', 120, 243, 'middle'], ['oct.', 10, 124, 'end']]
    .map(([t, x, y, anchor]) => `<text x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`)
    .join('');
  const c = seasonCount(sel);
  const caption = sel.id === current.id ? `faites ${sel.caption}` : c.total && c.done === c.total ? 'tout est fait' : sel.range;
  return `<svg viewBox="-34 -4 308 252" role="img" aria-label="Roue de l’année : aujourd’hui en ${esc(current.name.toLowerCase())}">
      <circle class="wheel__track" cx="120" cy="120" r="${R}"/>${arcs}
      <circle class="wheel__now-ring" cx="${nx}" cy="${ny}" r="9"/><circle class="wheel__now" cx="${nx}" cy="${ny}" r="5"/>
      <g class="wheel__labels">${labels}</g>
    </svg>
    <div class="wheel__center" aria-live="polite"><span class="wheel__name" data-season="${sel.id}">${esc(sel.name)}</span><b>${c.done}<small>/${c.total}</small></b><span class="wheel__caption">${esc(caption)}</span></div>`;
}

function group(m, label, sel) {
  const all = monthTasks(m, { withHidden: true });
  const visible = all.filter(t => !t.hidden);
  const left = visible.filter(t => !t.done).length;
  const count = !visible.length ? '' : left ? `${left} à faire` : 'Tout est fait';
  const hidden = showHidden ? all.filter(t => t.hidden) : [];
  return `<section class="section season-group" data-season="${sel.id}">
      <header class="section__head"><h2 class="section__title">${esc(label)}</h2><span class="section__count">${count}</span></header>
      <div class="card card--list">${visible.length || hidden.length ? [...visible, ...hidden].map(taskRow).join('') : '<div class="empty-state"><p>Rien de prévu ce mois-ci.</p></div>'}</div>
    </section>`;
}

export function renderSeason() {
  const now = nowMonth();
  const current = seasonOf(now);
  const sel = picked || current;
  $('#seasonWheel').innerHTML = wheel(sel, current);
  $('#seasonPicker').innerHTML = SEASONS.map(s => {
    const c = seasonCount(s);
    const left = c.total - c.done;
    return `<button type="button" class="wheel__pick" data-season="${s.id}" aria-pressed="${s.id === sel.id}"><b>${esc(s.name)}</b><small>${!c.total ? '—' : left ? `${left} à faire` : 'tout fait'}</small></button>`;
  }).join('');
  // Saison en cours : le mois courant d'abord, puis la suite, les mois passés en dernier.
  let months = sel.months;
  if (sel.id === current.id) {
    const i = months.indexOf(now);
    months = [...months.slice(i), ...months.slice(0, i)];
  }
  const label = m => {
    const name = cap(MONTH_NAMES[m - 1]);
    if (sel.id !== current.id) return name;
    if (m === now) return `${name} · ce mois-ci`;
    return sel.months.indexOf(m) > sel.months.indexOf(now) ? name : `${name} · passé`;
  };
  const hiddenCount = sel.months.reduce((n, m) => n + monthTasks(m, { withHidden: true }).filter(t => t.hidden).length, 0);
  $('#seasonGroups').innerHTML =
    months.map(m => group(m, label(m), sel)).join('') +
    (hiddenCount ? `<button type="button" class="link-btn link-btn--center season-hidden-toggle" data-toggle-hidden>${showHidden ? 'Cacher' : 'Voir'} les tâches masquées (${hiddenCount})</button>` : '');
}

function update(fn) {
  const season = store.get('season');
  fn(season);
  store.set('season', season);
}

async function onTaskMenu(id, m) {
  const t = monthTasks(m, { withHidden: true }).find(x => x.id === id);
  if (!t) return;
  if (t.custom) {
    if (!(await confirmDialog({ title: `Supprimer « ${t.label} » ?`, confirmLabel: 'Supprimer', danger: true }))) return;
    update(s => (s.custom = s.custom.filter(x => x.id !== id)));
    return toast('Tâche supprimée');
  }
  update(s => (s.hidden = t.hidden ? s.hidden.filter(x => x !== id) : [...s.hidden, id]));
  toast(t.hidden ? 'Tâche réaffichée' : 'Tâche masquée');
}

export function openSeasonTask() {
  const form = $('#seasonForm');
  form.reset();
  clearErrors(form);
  form.elements.month.innerHTML = MONTH_NAMES.map((n, i) => `<option value="${i + 1}">${n.replace(/^./, c => c.toUpperCase())}</option>`).join('');
  form.elements.category.innerHTML = CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');
  const sel = picked || seasonOf(nowMonth());
  form.elements.month.value = String(sel.months.includes(nowMonth()) ? nowMonth() : sel.months[0]);
  form.elements.category.value = 'Autre';
  openSheet('seasonSheet', { focus: false });
}

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, { label: [rules.required('La tâche'), rules.maxLength(80)] });
  if (!valid) return showErrors(form, errors);
  update(s => s.custom.push({ id: makeId(), label: val.label, month: Number(val.month), category: val.category }));
  picked = seasonOf(Number(val.month));
  closeSheet('seasonSheet');
  toast('Tâche ajoutée au calendrier');
}

export function initSeason() {
  $('#seasonForm').addEventListener('submit', onSubmit);
  $('#seasonPanel').addEventListener('click', e => {
    const pick = e.target.closest('.wheel__pick, .wheel__arc');
    if (pick) {
      picked = SEASONS.find(s => s.id === pick.dataset.season);
      showHidden = false;
      return renderSeason();
    }
    if (e.target.closest('[data-toggle-hidden]')) {
      showHidden = !showHidden;
      return renderSeason();
    }
    const row = e.target.closest('[data-task]');
    if (row && e.target.closest('[data-task-menu]')) return onTaskMenu(row.dataset.task, Number(row.dataset.month));
  });
  $('#seasonPanel').addEventListener('change', e => {
    const row = e.target.closest('[data-task]');
    if (!row || !e.target.matches('[data-task-toggle]')) return;
    const id = row.dataset.task;
    const y = year();
    update(s => {
      const set = new Set(s.done[y] || []);
      if (e.target.checked) set.add(id);
      else set.delete(id);
      s.done[y] = [...set];
    });
  });
}


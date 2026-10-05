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

let month = Number(todayKey().slice(5, 7));
let showHidden = false;
const year = () => todayKey().slice(0, 4);

/** Tâches d'un mois (prédéfinies non masquées + perso), avec leur état pour l'année en cours. */
export function monthTasks(m = Number(todayKey().slice(5, 7)), { withHidden = false } = {}) {
  const season = store.get('season');
  const done = new Set(season.done[year()] || []);
  const hidden = new Set(season.hidden);
  const builtIn = relevantTasks(store.home())
    .filter(t => t.month === m)
    .map(t => ({ ...t, custom: false, hidden: hidden.has(t.id) }));
  const custom = season.custom.filter(t => t.month === m).map(t => ({ ...t, custom: true, hidden: false }));
  return [...builtIn, ...custom].filter(t => withHidden || !t.hidden).map(t => ({ ...t, done: done.has(t.id) }));
}

function taskRow(t) {
  return `<div class="row season-task ${t.done ? 'is-done' : ''} ${t.hidden ? 'is-hidden' : ''}" data-task="${esc(t.id)}">
    <label class="season-task__check"><input type="checkbox" data-task-toggle ${t.done ? 'checked' : ''} ${t.hidden ? 'disabled' : ''} aria-label="Fait"><span></span></label>
    <div class="row__body"><span class="row__title">${esc(t.label)}</span><span class="row__sub">${esc(t.category)}${t.custom ? ' · perso' : ''}</span></div>
    <button type="button" class="icon-btn icon-btn--sm" data-task-menu aria-label="${t.custom ? 'Supprimer' : t.hidden ? 'Réafficher' : 'Masquer'}" title="${t.custom ? 'Supprimer' : t.hidden ? 'Réafficher' : 'Masquer (ne concerne pas ma maison)'}">${icon(t.custom ? 'trash' : t.hidden ? 'refresh' : 'close', 16)}</button>
  </div>`;
}

export function renderSeason() {
  const now = Number(todayKey().slice(5, 7));
  $('#seasonMonths').innerHTML = MONTH_NAMES.map((name, i) => {
    const m = i + 1;
    const tasks = monthTasks(m);
    const left = tasks.filter(t => !t.done).length;
    return `<button type="button" class="month-chip ${m === now ? 'is-now' : ''}" data-month="${m}" aria-pressed="${m === month}"><span>${name.slice(0, 4)}${name.length > 4 ? '.' : ''}</span>${tasks.length ? `<small>${left ? left : '✓'}</small>` : ''}</button>`;
  }).join('');
  const all = monthTasks(month, { withHidden: true });
  const visible = all.filter(t => !t.hidden);
  const hidden = all.filter(t => t.hidden);
  const done = visible.filter(t => t.done).length;
  $('#seasonTitle').textContent = `${MONTH_NAMES[month - 1].replace(/^./, c => c.toUpperCase())} ${year()}`;
  $('#seasonSub').textContent = visible.length ? `${done} / ${visible.length} faite${done > 1 ? 's' : ''}` : '';
  $('#seasonProgress').style.setProperty('--value', `${visible.length ? Math.round((done / visible.length) * 100) : 0}%`);
  $('#seasonList').innerHTML =
    (visible.length ? visible.map(taskRow).join('') : '<div class="empty-state"><p>Rien de prévu ce mois-ci.</p></div>') +
    (hidden.length ? `<button type="button" class="link-btn link-btn--center season-hidden-toggle" data-toggle-hidden>${showHidden ? 'Cacher' : 'Voir'} les tâches masquées (${hidden.length})</button>${showHidden ? hidden.map(taskRow).join('') : ''}` : '');
  // Faire défiler les mois jusqu'au mois choisi
  const chip = $(`#seasonMonths [data-month="${month}"]`);
  chip?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function update(fn) {
  const season = store.get('season');
  fn(season);
  store.set('season', season);
}

async function onTaskMenu(id) {
  const t = monthTasks(month, { withHidden: true }).find(x => x.id === id);
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
  form.elements.month.value = String(month);
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
  month = Number(val.month);
  closeSheet('seasonSheet');
  toast('Tâche ajoutée au calendrier');
}

export function initSeason() {
  $('#seasonForm').addEventListener('submit', onSubmit);
  $('#seasonPanel').addEventListener('click', e => {
    const m = e.target.closest('[data-month]');
    if (m) {
      month = Number(m.dataset.month);
      showHidden = false;
      return renderSeason();
    }
    if (e.target.closest('[data-toggle-hidden]')) {
      showHidden = !showHidden;
      return renderSeason();
    }
    const row = e.target.closest('[data-task]');
    if (row && e.target.closest('[data-task-menu]')) return onTaskMenu(row.dataset.task);
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


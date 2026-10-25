/*
 * Bouton + de l'en-tête (comme « Ajouter » dans Mon Budget) : il s'ouvre en cercle sur un fil
 * d'une question par écran. Un entretien fait (lequel ? combien ?) ou une facture (laquelle ?
 * combien ?), puis « C'est noté ». Le reste (rappel, document, tâche de saison…) ouvre sa feuille.
 */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { reminderAlerts, dueText } from '../core/calc.js';
import { CATEGORY_ICONS, CHARGE_CATEGORIES, CHARGE_ICONS, makeId } from '../core/schema.js';
import { sectionOn } from '../core/sections.js';
import { promptDialog } from '../ui/dialog.js';
import { icon } from '../ui/icons.js';
import { euro } from '../views/common.js';
import { animate, stagger, shake, haptic, circleOpen, circleClose, Odometer, reducedMotion } from '../ui/anim.js';

const STEPS = ['what', 'pick', 'amount'];
const ORDER = [...STEPS, 'done'];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];
const MAX = 10000000;

let flow = null;
let closing = false;
let odo = null;
let openers = {};

const fresh = () => ({ step: 'what', kind: '', reminderId: '', category: '', digits: '', date: todayKey(), note: '', saved: null });
const isOpen = () => !$('#flow').hidden;
const amount = () => Number((flow.digits || '0').replace(',', '.')) || 0;
const reminders = () => reminderAlerts(store.get('reminders'));
const reminder = () => store.get('reminders').find(r => r.id === flow.reminderId);
const lower = s => s.replace(/^./, c => c.toLowerCase());

const choice = (attr, value, title, sub = '', ico = '', cls = '') =>
  `<button type="button" class="flow-choice ${cls}" ${attr}="${esc(value)}">${ico ? `<span class="flow-choice__icon">${icon(ico, 20)}</span>` : ''}<span class="flow-choice__title">${esc(title)}</span>${sub ? `<span class="flow-choice__sub">${esc(sub)}</span>` : ''}</button>`;

/* ---------- Les étapes ---------- */
function stepWhat() {
  const more = [
    ['reminder', 'Un rappel', 'bell'],
    ['doc', 'Un document', 'doc'],
    ['seasonTask', 'Une tâche de saison', 'leaf'],
    sectionOn('works') && ['work', 'Des travaux', 'hammer'],
    sectionOn('inventory') && ['item', 'Un objet', 'sofa']
  ].filter(Boolean);
  return `<h2 class="flow__title" id="flowTitle">Que voulez-vous noter ?</h2>
    <div class="flow-types">
      <button type="button" class="flow-type flow-type--main" data-flow-kind="maintenance">${icon('wrench', 36)}<span><strong>Un entretien fait</strong><small>Chaudière, ramonage, gouttières…</small></span></button>
      <button type="button" class="flow-type flow-type--alt" data-flow-kind="charge">${icon('coins', 36)}<span><strong>Une facture</strong><small>Électricité, eau, taxe foncière…</small></span></button>
    </div>
    <div class="flow-more">${more.map(([k, t, i]) => `<button type="button" class="flow-chip" data-flow-open="${k}">${icon(i, 16)}<span>${esc(t)}</span></button>`).join('')}</div>`;
}

function stepPick() {
  if (flow.kind === 'charge') {
    return `<h2 class="flow__title" id="flowTitle">Quelle facture ?</h2>
      <div class="flow-choices">${CHARGE_CATEGORIES.map(c => choice('data-flow-cat', c, c, '', CHARGE_ICONS[c] || 'coins', flow.category === c ? 'is-on' : '')).join('')}</div>`;
  }
  const list = reminders();
  return `<h2 class="flow__title" id="flowTitle">Quel entretien ?</h2>
    <div class="flow-choices">${list
      .map(r => {
        const level = r.status.level;
        return choice('data-flow-reminder', r.id, r.label, level === 'late' || level === 'soon' ? dueText(r.status) : r.category, CATEGORY_ICONS[r.category] || 'wrench', `is-${level}`);
      })
      .join('')}<button type="button" class="flow-other" data-flow-open="maintenance">Autre intervention…</button></div>`;
}

function stepAmount() {
  const dateLabel = flow.date === todayKey() ? 'Aujourd’hui' : formatKey(flow.date, { day: 'numeric', month: 'short' });
  const hint = flow.kind === 'charge' ? 'Le montant de la facture' : 'Laissez 0 si c’était gratuit';
  return `<h2 class="flow__title" id="flowTitle">Combien ?</h2>
    <div class="flow-amount">
      <output class="flow-amount__value${flow.digits ? '' : ' is-zero'}" id="flowAmount" aria-live="polite"><span id="flowDigits"></span><span class="flow-amount__eur">€</span></output>
      <p class="flow-amount__hint">${hint}</p>
    </div>
    <div class="flow-extras">
      <label class="flow-chip">${icon('calendar', 16)}<span>${esc(dateLabel)}</span><input type="date" id="flowDate" value="${esc(flow.date)}" max="${todayKey()}" aria-label="Date"></label>
      <button type="button" class="flow-chip${flow.note ? ' is-on' : ''}" data-flow-note>${icon('edit', 16)}<span>${flow.note ? esc(flow.note) : flow.kind === 'charge' ? 'Fournisseur' : 'Artisan'}</span></button>
    </div>
    <div class="flow-keys">${KEYS.map(k => `<button type="button" class="flow-key" data-flow-key="${k}" ${k === 'back' ? 'aria-label="Effacer"' : ''}>${k === 'back' ? icon('chevronLeft', 26) : k}</button>`).join('')}</div>
    <button type="button" class="btn btn--primary btn--lg btn--block flow-save" data-flow-save ${flow.kind === 'charge' && !amount() ? 'disabled' : ''}>Valider</button>`;
}

function stepDone() {
  const s = flow.saved;
  const when = s.date === todayKey() ? 'aujourd’hui' : `le ${formatKey(s.date, { day: 'numeric', month: 'long' })}`;
  const what = s.kind === 'charge' ? (s.category === 'Autre' ? 'Facture' : `Facture : ${lower(s.category)}`) : s.label;
  const next = s.next ? `<p class="flow-done__next">Prochain rappel : ${esc(formatKey(s.next, { month: 'long', year: 'numeric' }))}</p>` : '';
  return `<div class="flow-done">
      <span class="flow-done__check" aria-hidden="true">${icon('check', 52)}</span>
      <h2 class="flow__title" id="flowTitle">C’est noté</h2>
      <p class="flow-done__text">${esc(what)}${s.amount ? `, ${esc(euro(s.amount))}` : ''}, ${esc(when)}.</p>
      ${next}
    </div>
    <div class="flow-done__actions">
      <button type="button" class="btn btn--lg btn--block flow-done__again" data-flow-again>Noter autre chose</button>
      <button type="button" class="link-btn flow-done__close" data-flow-attach>${icon('paperclip', 16)}<span>Joindre la facture</span></button>
      <button type="button" class="link-btn flow-done__close" data-flow-close>Terminé</button>
    </div>`;
}

/** Rendu de l'étape ; `dir` (1 suivante, −1 précédente) fait glisser les étapes comme des cartes. */
function render({ dir = 0 } = {}) {
  const el = $('#flow');
  const index = STEPS.indexOf(flow.step);
  el.dataset.step = flow.step;
  $('#flowDots').querySelectorAll('span').forEach((d, i) => d.classList.toggle('is-on', i <= index));
  $('#flowDots').hidden = flow.step === 'done';
  $('#flowBack').hidden = flow.step === 'done';
  $('#flowBack').setAttribute('aria-label', flow.step === 'what' ? 'Fermer' : 'Retour');
  const tag = flow.step === 'pick' ? (flow.kind === 'charge' ? 'Facture' : 'Entretien') : flow.step === 'amount' ? (flow.kind === 'charge' ? flow.category : reminder()?.label || '') : '';
  $('#flowTag').textContent = tag;
  $('#flowTag').hidden = !tag;
  const body = { what: stepWhat, pick: stepPick, amount: stepAmount, done: stepDone }[flow.step]();
  const host = $('#flowBody');
  const old = host.querySelector('.flow__step');
  const step = document.createElement('div');
  step.className = 'flow__step';
  step.innerHTML = body;
  if (old && dir && !reducedMotion()) {
    Object.assign(old.style, { position: 'absolute', top: `${old.offsetTop}px`, left: `${old.offsetLeft}px`, width: `${old.offsetWidth}px`, height: `${old.offsetHeight}px`, pointerEvents: 'none' });
    animate(old, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 30}%)`, opacity: 0 }], { spring: 'settle', fill: 'forwards' }).finished.then(() => old.remove());
  } else old?.remove();
  host.append(step);
  if (flow.step === 'amount') {
    odo = new Odometer($('#flowDigits'));
    odo.set(flow.digits || '0', { pop: false });
  }
  if (dir) {
    animate(step, [{ transform: `translateX(${dir * 100}%)` }, { transform: 'none' }], { spring: 'settle' });
    if (dir > 0) stagger(step.querySelectorAll('.flow__title, .flow-type, .flow-more, .flow-choice, .flow-other, .flow-amount, .flow-extras, .flow-key'), { delay: 70, step: 24 });
  }
}

function go(step, { slide = true } = {}) {
  const dir = slide ? Math.sign(ORDER.indexOf(step) - ORDER.indexOf(flow.step)) || 1 : 0;
  flow.step = step;
  render({ dir });
  $('#flowBody').scrollTop = 0;
}

/** Le bouton + s'agrandit jusqu'à devenir le fil. */
export function openFlow() {
  if (closing || isOpen()) return;
  flow = fresh();
  const el = $('#flow');
  el.hidden = false;
  document.documentElement.classList.add('flow-open');
  render();
  haptic(6);
  circleOpen(el, $('#fabBtn'));
  stagger($$('.flow__head > *, .flow__title, .flow-type, .flow-more'), { delay: 140, step: 45 });
  $('#flowBack').focus({ preventScroll: true });
}

/** Le fil se referme dans le bouton + ; `then` ouvre ensuite une feuille (rappel, document…). */
async function closeFlow(then) {
  if (closing || !isOpen()) return;
  closing = true;
  const el = $('#flow');
  const fab = $('#fabBtn');
  await circleClose(el, fab).finished;
  el.hidden = true;
  el.getAnimations().forEach(a => a.cancel());
  document.documentElement.classList.remove('flow-open');
  flow = null;
  closing = false;
  animate(fab, [{ transform: 'scale(.8)' }, { transform: 'none' }], { spring: 'bounce' });
  if (then) then();
  else fab.focus({ preventScroll: true });
}

function back() {
  if (flow.step === 'amount') return go('pick');
  if (flow.step === 'pick') return go('what');
  closeFlow();
}

function press(key) {
  let d = flow.digits;
  if (key === 'back') {
    if (!d) return refuse();
    d = d.slice(0, -1);
  } else if (key === ',') d = d.includes(',') ? d : `${d || '0'},`;
  else {
    if (/,\d\d$/.test(d)) return refuse();
    d = d === '0' ? key : d + key;
  }
  if (Number(d.replace(',', '.')) > MAX) return refuse();
  haptic(5);
  flow.digits = d;
  odo?.set(flow.digits || '0');
  $('#flowAmount').classList.toggle('is-zero', !flow.digits);
  if (flow.kind === 'charge') $('#flowBody [data-flow-save]').disabled = !amount();
}

function refuse() {
  shake($('#flowAmount'));
  haptic([12, 40, 12]);
}

/** Prochaine échéance d'un rappel fait à `date`. */
function nextDate(r, date) {
  if (!r?.everyMonths) return '';
  const [y, m, d] = date.split('-').map(Number);
  const n = new Date(y, m - 1 + r.everyMonths, Math.min(d, 28));
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function save() {
  const value = Math.round(amount() * 100) / 100;
  if (flow.kind === 'charge' && !(value > 0)) return refuse();
  const button = $('#flowBody [data-flow-save]');
  const id = makeId();
  if (flow.kind === 'charge') {
    store.upsert('charges', { id, category: flow.category, label: '', date: flow.date, amount: value, provider: flow.note, note: '' });
    flow.saved = { kind: 'charge', id, category: flow.category, amount: value, date: flow.date };
  } else {
    const r = reminder();
    const item = { id, label: r.label, category: r.category, date: flow.date, cost: value, provider: flow.note, note: '' };
    // Le rappel repart de cette date (si c'est la plus récente).
    const patch = { maintenance: [...store.get('maintenance'), item] };
    patch.reminders = store.get('reminders').map(x => (x.id === r.id && (!x.lastDate || item.date >= x.lastDate) ? { ...x, lastDate: item.date } : x));
    store.setKeys(patch);
    flow.saved = { kind: 'maintenance', id, label: r.label, amount: value, date: flow.date, next: nextDate(r, flow.date) };
  }
  playDone(button);
}

/** « C'est noté » : le voile s'ouvre depuis « Valider », la coche se dessine, le texte arrive en cascade. */
async function playDone(button) {
  const s = flow.saved;
  haptic(14);
  const veil = document.createElement('div');
  veil.className = 'flow-veil';
  document.body.append(veil);
  await circleOpen(veil, button || $('#flowBody'), { duration: 480 }).finished;
  if (!flow || flow.saved !== s) return veil.remove();
  go('done', { slide: false });
  animate(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(() => veil.remove());
  const step = $('#flowBody .flow__step');
  animate(step.querySelector('.flow-done__check'), [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bounce', delay: 60 });
  const path = step.querySelector('.flow-done__check path');
  if (path) animate(path, [{ strokeDasharray: 24, strokeDashoffset: 24 }, { strokeDasharray: 24, strokeDashoffset: 0 }], { duration: 380, delay: 220, easing: 'cubic-bezier(.6, 0, .2, 1)' });
  stagger(step.querySelectorAll('.flow__title, .flow-done__text, .flow-done__next, .flow-done__actions > *'), { delay: 260, step: 60, distance: 14 });
}

async function editNote() {
  const value = await promptDialog({ title: flow.kind === 'charge' ? 'Quel fournisseur ?' : 'Quel artisan ?', label: flow.kind === 'charge' ? 'Fournisseur (facultatif)' : 'Entreprise ou artisan (facultatif)', value: flow.note, maxLength: 80, confirmLabel: 'OK' });
  if (value === null || !flow) return;
  flow.note = value.trim();
  render();
}

function onClick(e) {
  const t = e.target.closest('button');
  if (!t || !flow) return;
  if (t.id === 'flowBack') return back();
  if (t.dataset.flowKind) {
    flow.kind = t.dataset.flowKind;
    // Aucun rappel : la feuille d'intervention complète.
    if (flow.kind === 'maintenance' && !reminders().length) return closeFlow(() => openers.maintenance?.());
    return go('pick');
  }
  if (t.dataset.flowOpen) {
    const open = openers[t.dataset.flowOpen];
    return closeFlow(() => open?.());
  }
  if (t.dataset.flowReminder) {
    flow.reminderId = t.dataset.flowReminder;
    return go('amount');
  }
  if (t.dataset.flowCat) {
    flow.category = t.dataset.flowCat;
    return go('amount');
  }
  if (t.dataset.flowKey) return press(t.dataset.flowKey);
  if ('flowNote' in t.dataset) return editNote();
  if ('flowSave' in t.dataset) return save();
  if ('flowAgain' in t.dataset) {
    flow = fresh();
    return go('what');
  }
  if ('flowAttach' in t.dataset) {
    const s = flow.saved;
    return closeFlow(() => (s.kind === 'charge' ? openers.editCharge?.(s.id) : openers.editMaintenance?.(s.id)));
  }
  if ('flowClose' in t.dataset) return closeFlow();
}

function onKey(e) {
  if (!flow || !isOpen() || document.documentElement.classList.contains('is-locked')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    return flow.step === 'done' ? closeFlow() : back();
  }
  if (flow.step !== 'amount' || e.target.matches?.('input, textarea, select')) return;
  if (/^\d$/.test(e.key)) press(e.key);
  else if (e.key === ',' || e.key === '.') press(',');
  else if (e.key === 'Backspace') press('back');
  else if (e.key === 'Enter') save();
  else return;
  e.preventDefault();
}

/** `ops` : feuilles ouvertes depuis le fil (reminder, doc, seasonTask, work, item, maintenance, editMaintenance, editCharge). */
export function initAddFlow(ops) {
  openers = ops;
  $('#flow').addEventListener('click', onClick);
  $('#flow').addEventListener('change', e => {
    if (e.target.id !== 'flowDate' || !flow) return;
    flow.date = e.target.value || todayKey();
    render();
  });
  document.addEventListener('keydown', onKey);
}

/*
 * Pop-up au démarrage : entretiens en retard. Un seul passage par session ;
 * défilement par « Suivant » puis « Terminé » quand il y en a plusieurs.
 */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { reminderAlerts, dueText } from '../core/calc.js';
import { CATEGORY_ICONS } from '../core/schema.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { icon } from '../ui/icons.js';
import { formatKey } from '../core/dates.js';

let items = [];
let index = 0;
let onView = null;
let checked = false;

function render() {
  const n = items.length;
  const r = items[index];
  const last = index === n - 1;
  $('#overdueContent').innerHTML = `
    <div class="dialog__icon dialog__icon--danger">${icon(CATEGORY_ICONS[r.category] || 'wrench', 22)}</div>
    <h2 class="dialog__title" id="overdueTitle">Entretien en retard</h2>
    ${n > 1 ? `<p class="dialog__message">Rappel ${index + 1} sur ${n}</p>` : ''}
    <div class="cal-card">
      <div class="cal-card__title">${esc(r.label)}</div>
      <div class="cal-card__row">${icon('calendar', 16)}<span>Prévu le ${esc(formatKey(r.status.nextDate))}</span></div>
      <div class="cal-card__row">${icon('clock', 16)}<span>${esc(dueText(r.status))}</span></div>
    </div>
    <div class="dialog__actions dialog__actions--stack">
      <button type="button" class="btn btn--soft" data-overdue="view">${icon('check', 18)}<span>C’est fait : l’enregistrer</span></button>
      <button type="button" class="btn btn--primary" data-overdue="${last ? 'done' : 'next'}">${last ? 'Terminé' : 'Suivant'}</button>
    </div>`;
}

/** À appeler une fois l'application prête (données chargées, écran de connexion masqué). */
export function checkOverdue() {
  if (checked) return;
  checked = true;
  items = reminderAlerts(store.get('reminders')).filter(r => r.status.level === 'late');
  if (!items.length) return;
  index = 0;
  render();
  openSheet('overdueSheet', { focus: false });
}

export function initOverduePrompt({ onView: handler } = {}) {
  onView = handler || null;
  $('#overdueContent').addEventListener('click', e => {
    const action = e.target.closest('[data-overdue]')?.dataset.overdue;
    if (action === 'next') {
      index = Math.min(index + 1, items.length - 1);
      render();
    } else if (action === 'done') {
      closeSheet('overdueSheet');
    } else if (action === 'view') {
      const r = items[index];
      closeSheet('overdueSheet');
      onView?.(r.id);
    }
  });
}

/*
 * Pop-up au démarrage : entretiens en retard, en une seule liste (un appui sur une
 * ligne ouvre l'enregistrement de l'intervention, un bouton pour fermer).
 * Un seul passage par session.
 */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { reminderAlerts, dueText } from '../core/calc.js';
import { CATEGORY_ICONS } from '../core/schema.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { icon } from '../ui/icons.js';

let items = [];
let onView = null;
let checked = false;

function render() {
  const n = items.length;
  $('#overdueContent').innerHTML = `
    <div class="dialog__icon dialog__icon--danger">${icon('wrench', 22)}</div>
    <h2 class="dialog__title" id="overdueTitle">${n > 1 ? `${n} entretiens en retard` : 'Entretien en retard'}</h2>
    <div class="ov-list">${items
      .map(
        r => `<button type="button" class="ov-row" data-overdue="${esc(r.id)}">
          <span class="ov-row__icon">${icon(CATEGORY_ICONS[r.category] || 'wrench', 16)}</span>
          <span class="ov-row__body"><strong>${esc(r.label)}</strong><span>${esc(dueText(r.status))}</span></span>
          ${icon('chevronRight', 16)}
        </button>`
      )
      .join('')}</div>
    <p class="dialog__message">Touchez un entretien une fois fait pour l’enregistrer.</p>
    <div class="dialog__actions dialog__actions--stack"><button type="button" class="btn btn--primary" data-close>Fermer</button></div>`;
}

/** À appeler une fois l'application prête (données chargées, écran de connexion masqué). */
export function checkOverdue() {
  if (checked) return;
  checked = true;
  items = reminderAlerts(store.get('reminders')).filter(r => r.status.level === 'late');
  if (!items.length) return;
  render();
  openSheet('overdueSheet', { focus: false });
}

export function initOverduePrompt({ onView: handler } = {}) {
  onView = handler || null;
  $('#overdueContent').addEventListener('click', e => {
    const id = e.target.closest('[data-overdue]')?.dataset.overdue;
    if (!id) return;
    closeSheet('overdueSheet');
    onView?.(id);
  });
}

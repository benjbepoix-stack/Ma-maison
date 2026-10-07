/* Accueil : fiche de la maison, échéances, travaux à venir, valeur et crédit. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { reminderAlerts, dueText, workTotals, currentLoan, chargesLast12 } from '../core/calc.js';
import { CATEGORY_ICONS, WORK_STATUS } from '../core/schema.js';
import { icon } from '../ui/icons.js';
import { euro, euroRound, euroShort, intFmt } from './common.js';
import { monthTasks } from './season.js';
import { expiryLevel } from './docs.js';
import { MONTH_NAMES } from '../core/season-tasks.js';

const fact = (label, value, cls = '') => `<div class="fact ${cls}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;

function renderHero(h) {
  if (!h) {
    $('#houseHero').innerHTML = `
      <div class="house-hero__icon">${icon('home', 30)}</div>
      <div class="house-hero__body">
        <h2 class="house-hero__name">Bienvenue</h2>
        <p class="house-hero__sub">Décrivez votre maison : le plan d’entretien sera pré-rempli selon votre chauffage.</p>
        <button type="button" class="btn btn--primary btn--sm house-hero__cta" data-open="house">${icon('plus', 16)}<span>Créer la fiche</span></button>
      </div>`;
    return;
  }
  const facts = [h.type, h.surface ? `${intFmt(h.surface)} m²` : '', h.rooms ? `${h.rooms} pièces` : '', h.year ? `${h.year}` : ''].filter(Boolean).join(' · ');
  $('#houseHero').innerHTML = `
    <div class="house-hero__icon">${icon(h.type === 'Appartement' ? 'building' : 'home', 30)}</div>
    <div class="house-hero__body">
      <h2 class="house-hero__name">${esc(h.name)}</h2>
      ${h.address ? `<p class="house-hero__sub">${esc(h.address)}</p>` : ''}
      <p class="house-hero__sub">${esc(facts)}</p>
      <div class="house-hero__chips"><span class="pill">${icon('flame', 14)}${esc(h.heating)}</span>${h.dpe ? `<span class="pill dpe dpe--${h.dpe}">DPE ${h.dpe}</span>` : ''}${h.land ? `<span class="pill">${icon('tree', 14)}${intFmt(h.land)} m²</span>` : ''}</div>
    </div>
    <button type="button" class="icon-btn icon-btn--sm house-hero__edit" data-open="house" aria-label="Modifier la fiche">${icon('edit', 17)}</button>`;
}

export function renderHome() {
  const h = store.home();
  renderHero(h);

  const reminders = reminderAlerts(store.get('reminders'));
  const late = reminders.filter(r => r.status.level === 'late');
  const soon = reminders.filter(r => r.status.level === 'soon');
  const year = todayKey().slice(0, 4);
  const maintenance = store.get('maintenance');
  const yearCost = maintenance.filter(x => x.date.startsWith(year)).reduce((s, x) => s + x.cost, 0);
  const works = store.get('works');
  const active = works.filter(w => w.status !== 'done');
  const worksNet = active.reduce((s, w) => s + workTotals(w).net, 0);

  $('#homeKpis').innerHTML = `
    <button type="button" class="kpi kpi--link ${late.length ? 'kpi--is-late' : ''}" data-goto="maintenance/plan"><span>En retard</span><strong>${late.length}</strong><small>entretien${late.length > 1 ? 's' : ''}</small></button>
    <button type="button" class="kpi kpi--link ${soon.length ? 'kpi--is-soon' : ''}" data-goto="maintenance/plan"><span>Sous 30 jours</span><strong>${soon.length}</strong><small>à prévoir</small></button>
    <button type="button" class="kpi kpi--link" data-goto="finances/charges"><span>Charges</span><strong>${esc(euroShort(chargesLast12(store.get('charges'), store.get('recurring')).monthly))}</strong><small>par mois · entretien ${year} : ${esc(euroShort(yearCost))}</small></button>
    <button type="button" class="kpi kpi--link" data-goto="works"><span>Travaux à venir</span><strong>${esc(euroShort(worksNet))}</strong><small>reste à charge</small></button>`;

  const shown = reminders.filter(r => ['late', 'soon', 'unknown'].includes(r.status.level)).slice(0, 5);
  // Rubriques vides masquées : l'accueil ne montre que ce qui demande une action.
  $('#homeAlerts').closest('.section').hidden = !shown.length;
  $('#homeAlerts').innerHTML = shown.length
    ? shown
        .map(
          r => `<button type="button" class="row" data-goto="maintenance/plan">
        <span class="row__icon is-${r.status.level === 'unknown' ? 'none' : r.status.level}">${icon(CATEGORY_ICONS[r.category] || 'wrench', 18)}</span>
        <span class="row__body"><span class="row__title">${esc(r.label)}</span><span class="row__sub">${esc(r.status.nextDate ? `${dueText(r.status)} · ${formatKey(r.status.nextDate)}` : dueText(r.status))}</span></span>
        ${icon('chevronRight', 18)}
      </button>`
        )
        .join('')
    : `<div class="empty-state"><span class="empty-state__icon">${icon('check', 22)}</span><p>${reminders.length ? 'Tout est à jour. Rien à prévoir dans les 30 jours.' : 'Aucun rappel d’entretien pour l’instant.'}</p></div>`;

  // Calendrier de saison : tâches du mois restant à faire
  const month = Number(todayKey().slice(5, 7));
  const tasks = monthTasks(month);
  const todo = tasks.filter(t => !t.done);
  $('#homeSeasonTitle').textContent = `En ${MONTH_NAMES[month - 1]}`;
  $('#homeSeasonSection').hidden = !todo.length;
  $('#homeSeason').innerHTML = tasks.length
    ? todo.length
      ? `${todo
          .slice(0, 4)
          .map(t => `<button type="button" class="row" data-goto="maintenance/saison"><span class="row__icon">${icon(CATEGORY_ICONS[t.category] || 'leaf', 18)}</span><span class="row__body"><span class="row__title">${esc(t.label)}</span><span class="row__sub">${esc(t.category)}</span></span>${icon('chevronRight', 18)}</button>`)
          .join('')}${todo.length > 4 ? `<button type="button" class="row row--more" data-goto="maintenance/saison">+ ${todo.length - 4} autre${todo.length - 4 > 1 ? 's' : ''}</button>` : ''}`
      : `<div class="empty-state"><span class="empty-state__icon">${icon('check', 22)}</span><p>Toutes les tâches de ${MONTH_NAMES[month - 1]} sont faites.</p></div>`
    : '<div class="empty-state"><p>Rien de prévu ce mois-ci.</p></div>';

  // Garanties et échéances proches (documents + inventaire)
  const expiring = [
    ...store.get('docs').map(d => ({ title: d.title, e: expiryLevel(d), goto: 'dossier/documents', icon: 'doc' })),
    ...store.get('inventory').map(i => ({ title: `${i.name} · garantie`, e: i.warrantyEnd ? expiryLevel({ expiry: i.warrantyEnd }) : null, goto: 'dossier/inventaire', icon: 'shield' }))
  ]
    .filter(x => x.e && x.e.level === 'soon')
    .sort((a, b) => a.e.days - b.e.days)
    .slice(0, 4);
  $('#homeDocsSection').hidden = !expiring.length;
  $('#homeDocs').innerHTML = expiring
    .map(x => `<button type="button" class="row" data-goto="${x.goto}"><span class="row__icon is-soon">${icon(x.icon, 18)}</span><span class="row__body"><span class="row__title">${esc(x.title)}</span><span class="row__sub">Expire dans ${x.e.days} jour${x.e.days > 1 ? 's' : ''}</span></span>${icon('chevronRight', 18)}</button>`)
    .join('');

  const nextWorks = active.sort((a, b) => a.priority - b.priority || (a.targetDate || '9999').localeCompare(b.targetDate || '9999')).slice(0, 3);
  $('#homeWorks').closest('.section').hidden = !nextWorks.length;
  $('#homeWorks').innerHTML = nextWorks.length
    ? nextWorks
        .map(
          w => `<button type="button" class="row" data-work-open="${esc(w.id)}">
        <span class="row__icon">${icon('hammer', 18)}</span>
        <span class="row__body"><span class="row__title">${esc(w.name)}</span><span class="row__sub">${esc([WORK_STATUS[w.status], w.targetDate ? formatKey(w.targetDate, { month: 'long', year: 'numeric' }) : ''].filter(Boolean).join(' · '))}</span></span>
        <span class="row__amount">${esc(euroRound(workTotals(w).net))}</span>
      </button>`
        )
        .join('')
    : `<div class="empty-state"><p>Aucun projet de travaux.</p><button type="button" class="btn btn--soft btn--sm" data-open="work">${icon('plus', 16)}<span>Chiffrer des travaux</span></button></div>`;

  // Valeur & crédit (valeur = votre estimation, saisie dans la fiche de la maison)
  const value = h?.estimatedValue || 0;
  const loan = currentLoan(h);
  const doneWorks = works.filter(w => w.status === 'done').reduce((s, w) => s + (w.spent || workTotals(w).net), 0);
  const maintenanceTotal = maintenance.reduce((s, x) => s + x.cost, 0);
  const invested = (h?.purchasePrice || 0) + (h?.purchaseFees || 0) + doneWorks;
  const rows = [];
  if (h?.purchasePrice) rows.push(fact(`Achat${h.purchaseDate ? ` (${formatKey(h.purchaseDate, { month: 'short', year: 'numeric' })})` : ''}`, euro(h.purchasePrice + h.purchaseFees)));
  if (doneWorks) rows.push(fact('Travaux réalisés', euro(doneWorks)));
  if (maintenanceTotal) rows.push(fact('Entretien cumulé', euro(maintenanceTotal)));
  if (value) {
    rows.push(fact('Valeur estimée', euro(value), 'fact--total'));
    if (invested) {
      const gain = value - invested;
      rows.push(fact('Plus-value latente', `${gain >= 0 ? '+' : '−'} ${euro(Math.abs(gain))}`, gain >= 0 ? 'fact--minus' : 'fact--danger'));
    }
  }
  if (loan) {
    rows.push(fact('Mensualité du crédit', loan.done ? 'Remboursé' : `${euro(loan.monthly)} · ${loan.elapsed}/${loan.months}`));
    rows.push(fact('Capital restant dû', euro(loan.remaining)));
    if (value) rows.push(fact('Patrimoine net', euro(value - loan.remaining), 'fact--total'));
  }
  $('#homeValue').closest('.section').hidden = !rows.length;
  $('#homeValue').innerHTML = rows.length
    ? `<dl class="facts">${rows.join('')}</dl>`
    : `<div class="empty-state"><p>Renseignez le prix d’achat, la valeur estimée et le crédit en cours pour suivre la plus-value et le capital restant dû.</p></div>`;
}

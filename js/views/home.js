/* Onglet Maison : le chalet et ses pastilles, le fil de l'année, garanties, rubriques et valeur. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { formatKey } from '../core/dates.js';
import { reminderAlerts, workTotals, currentLoan } from '../core/calc.js';
import { icon } from '../ui/icons.js';
import { euro, euroRound, intFmt } from './common.js';
import { renderChalet, renderYear } from './chalet.js';
import { expiryLevel } from './docs.js';
import { sectionOn } from '../core/sections.js';

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
  // Sans fiche : invitation à décrire la maison ; ensuite, le chalet dessiné.
  $('#houseHero').hidden = Boolean(h);
  $('#chalet').hidden = !h;
  const reminders = reminderAlerts(store.get('reminders'));
  if (h) renderChalet(reminders);
  else renderHero(h);
  renderYear(reminders);
  const maintenance = store.get('maintenance');
  const works = store.get('works');
  const active = works.filter(w => w.status !== 'done');

  // Garanties et échéances proches (documents + inventaire, s'il est affiché)
  const expiring = [
    ...store.get('docs').map(d => ({ title: d.title, e: expiryLevel(d), goto: 'dossier/documents', icon: 'doc' })),
    ...(sectionOn('inventory') ? store.get('inventory') : []).map(i => ({ title: `${i.name} · garantie`, e: i.warrantyEnd ? expiryLevel({ expiry: i.warrantyEnd }) : null, goto: 'dossier/inventaire', icon: 'shield' }))
  ]
    .filter(x => x.e && x.e.level === 'soon')
    .sort((a, b) => a.e.days - b.e.days)
    .slice(0, 4);
  $('#homeDocsSection').hidden = !expiring.length;
  $('#homeDocs').innerHTML = expiring
    .map(x => `<button type="button" class="row" data-goto="${x.goto}"><span class="row__icon is-soon">${icon(x.icon, 18)}</span><span class="row__body"><span class="row__title">${esc(x.title)}</span><span class="row__sub">Expire dans ${x.e.days} jour${x.e.days > 1 ? 's' : ''}</span></span>${icon('chevronRight', 18)}</button>`)
    .join('');

  // Dans la maison : la fiche, puis les rubriques sans onglet (Travaux, Documents, Inventaire).
  const facts = h ? [h.type, h.surface ? `${intFmt(h.surface)} m²` : '', h.heating, h.dpe ? `DPE ${h.dpe}` : ''].filter(Boolean).join(' · ') : '';
  const docs = store.get('docs');
  const inventory = store.get('inventory');
  const worksNet = active.reduce((s, w) => s + workTotals(w).net, 0);
  const row = (attrs, iconName, title, sub, amount = '') =>
    `<button type="button" class="row" ${attrs}><span class="row__icon">${icon(iconName, 18)}</span><span class="row__body"><span class="row__title">${esc(title)}</span>${sub ? `<span class="row__sub">${esc(sub)}</span>` : ''}</span>${amount ? `<span class="row__amount">${esc(amount)}</span>` : icon('chevronRight', 18)}</button>`;
  $('#homeInside').innerHTML = [
    h ? row('data-open="house"', h.type === 'Appartement' ? 'building' : 'home', 'Fiche de la maison', [h.address, facts].filter(Boolean).join(' · ')) : '',
    sectionOn('works') ? row('data-goto="works"', 'hammer', 'Travaux', active.length ? `${active.length} projet${active.length > 1 ? 's' : ''} à réaliser` : 'Aucun projet en cours', active.length ? euroRound(worksNet) : '') : '',
    row('data-goto="dossier/documents"', 'archive', 'Documents', docs.length ? `${docs.length} document${docs.length > 1 ? 's' : ''}` : 'Factures, garanties, diagnostics'),
    sectionOn('inventory') ? row('data-goto="dossier/inventaire"', 'shield', 'Inventaire', inventory.length ? `${inventory.length} objet${inventory.length > 1 ? 's' : ''} de valeur` : 'Biens de valeur pour l’assureur') : ''
  ].join('');

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

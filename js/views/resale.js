/*
 * Crédit & revente : tableau d'amortissement (importé ou calculé) et analyse
 * de la date de vente pour une « opération à zéro » selon le prix de vente.
 */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { formatKey } from '../core/dates.js';
import { resaleAnalysis } from '../core/calc.js';
import { IRA_MODES } from '../core/schema.js';
import { rowsFromFile, rowsFromText, analyze, buildRows } from '../features/amortization-import.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { renderLines, PALETTE } from '../ui/charts.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { euro, euroRound, euroShort, toNumber, numInput, pct } from './common.js';
import { yearlyPropertyTax } from './charges.js';

const DEFAULT_RESALE = { price: 0, feesPct: 5, extraFees: 500, growth: 1, ira: 'legal', includeWorks: true, includeMaintenance: false, includeTax: false };
const monthLabel = m => formatKey(`${m}-01`, { month: 'long', year: 'numeric' });
const shortMonth = m => formatKey(`${m}-01`, { month: 'short', year: 'numeric' });
const fact = (label, value, cls = '') => `<div class="fact ${cls}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
const signed = v => `${v >= 0 ? '+' : '−'} ${euroRound(Math.abs(v))}`;
const signedShort = v => `${v >= 0 ? '+' : '−'} ${euroShort(Math.abs(v))}`;

let settings = null; // hypothèses en cours de saisie
let saveTimer = null;
let formBuilt = false;
let importState = null;

const current = () => ({ ...DEFAULT_RESALE, ...(store.get('resale') || {}) });
function inYears(month, nowMonth) {
  const [y1, m1] = nowMonth.split('-').map(Number);
  const [y2, m2] = month.split('-').map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  if (months < 12) return `dans ${months} mois`;
  const y = Math.floor(months / 12);
  const r = months % 12;
  return `dans ${y} an${y > 1 ? 's' : ''}${r ? ` et ${r} mois` : ''}`;
}

/* ---------- Bloc crédit ---------- */
function renderLoan(a) {
  const h = store.home();
  const imported = store.get('amortization');
  const rows = a.rows;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const paidShare = a.principal ? Math.max(0, Math.min(100, Math.round((1 - a.now.crd / a.principal) * 100))) : 0;
  const monthly = rows.find(r => r.date.slice(0, 7) >= a.now.month)?.payment || last?.payment || 0;
  $('#loanCard').innerHTML = rows.length
    ? `<div class="loan-source">${icon(imported ? 'check' : 'calculator', 16)}<span>${imported ? `Tableau importé${imported.source ? ` (${esc(imported.source)})` : ''} · ${rows.length} échéances` : 'Calculé depuis la fiche de la maison (importez le tableau de la banque pour plus de précision)'}</span></div>
      <dl class="facts">
        ${fact('Capital restant dû aujourd’hui', euro(a.now.crd), 'fact--total')}
        ${fact('Échéance mensuelle', euro(monthly))}
        ${fact('Période', `${shortMonth(first.date.slice(0, 7))} → ${shortMonth(last.date.slice(0, 7))}`)}
        ${a.rate ? fact(`Taux${h?.loanRate ? '' : ' (déduit du tableau)'}`, pct(a.rate, 2)) : ''}
        ${fact('Indemnités si remboursement aujourd’hui', euro(a.now.ira))}
      </dl>
      <div class="finance-progress"><div class="due__bar"><span style="--value:${paidShare}%"></span></div><p class="card__sub">${paidShare} % du capital remboursé</p></div>`
    : `<div class="empty-state"><p>Importez le tableau d’amortissement de la banque, ou renseignez le crédit en cours dans la fiche de la maison.</p></div>`;
  $('#amortClear').hidden = !imported;
}

/* ---------- Hypothèses (formulaire en direct) ---------- */
const input = (key, label, unit, placeholder = '') => `<div class="field"><label class="field__label" for="rs-${key}">${esc(label)} · ${esc(unit)}</label><input class="input" id="rs-${key}" data-r="${key}" inputmode="decimal" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(numInput(settings[key]))}"></div>`;
const check = (key, label) => `<label class="check"><input type="checkbox" data-r="${key}" ${settings[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`;

function buildForm() {
  const h = store.home();
  $('#resaleForm').innerHTML = `
    <div class="form-grid">
      ${input('price', 'Prix de vente', '€', h?.estimatedValue ? `Estimé : ${euroRound(h.estimatedValue)}` : 'Ex. 280 000')}
      ${input('growth', 'Évolution du prix', '%/an', '0')}
      ${input('feesPct', 'Frais d’agence', '%', '0')}
      ${input('extraFees', 'Autres frais de vente', '€', 'Diagnostics, mainlevée')}
    </div>
    <div class="field"><label class="field__label" for="rs-ira">Indemnités de remboursement anticipé</label><select class="input select" id="rs-ira" data-r="ira">${Object.entries(IRA_MODES).map(([k, v]) => `<option value="${k}" ${settings.ira === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <span class="field__label">Compter dans l’argent investi</span>
    ${check('includeWorks', 'Travaux réalisés (onglet Travaux)')}
    ${check('includeMaintenance', 'Entretien (historique des interventions)')}
    ${check('includeTax', 'Taxe foncière (onglet Charges)')}`;
  formBuilt = true;
}

function analysis() {
  return resaleAnalysis({
    home: store.home(),
    amortization: store.get('amortization'),
    resale: settings,
    works: store.get('works'),
    maintenance: store.get('maintenance'),
    taxPerYear: yearlyPropertyTax()
  });
}

function milestoneHtml(title, m, now, priceKey, explain) {
  const nowMonth = now.month;
  let main;
  let cls;
  if (m.reached) {
    cls = 'is-ok';
    main = m.since.past ? `Atteinte depuis ${monthLabel(m.since.month)}` : 'Atteinte dès aujourd’hui';
  } else if (m.at) {
    cls = 'is-soon';
    main = `${monthLabel(m.at.month).replace(/^./, c => c.toUpperCase())} · ${inYears(m.at.month, nowMonth)}`;
  } else {
    cls = 'is-late';
    main = 'Non atteinte avec ces hypothèses';
  }
  return `<div class="milestone ${cls}">
    <div class="milestone__head"><span class="milestone__dot"></span><span class="milestone__title">${esc(title)}</span></div>
    <div class="milestone__main">${esc(main)}</div>
    <p class="milestone__sub">${esc(explain)} Prix minimum aujourd’hui : <b>${esc(euroRound(now[priceKey]))}</b>${m.at ? ` · à cette date : ${esc(euroRound(m.at[priceKey]))} (prix estimé ${esc(euroRound(m.at.price))})` : ''}.</p>
  </div>`;
}

function renderResults() {
  const a = analysis();
  renderLoan(a);
  const now = a.now;
  if (!a.P0) {
    $('#resaleResults').innerHTML = '<div class="empty-state"><p>Indiquez un prix de vente (ou la valeur estimée dans la fiche de la maison).</p></div>';
    $('#resaleChart').innerHTML = '';
    $('#resaleTable').innerHTML = '';
    return;
  }
  const missing = [];
  if (!store.home()?.purchasePrice) missing.push('le prix d’achat');
  if (!store.home()?.loanPrincipal && a.rows.length) missing.push('le montant emprunté');
  $('#resaleResults').innerHTML = `
    ${missing.length ? `<p class="pj-warning is-soon">${icon('alert', 18)}<span>Renseignez ${esc(missing.join(' et '))} dans la fiche de la maison : l’apport initial en dépend.</span></p>` : ''}
    <div class="card cost-hero">
      <div class="cost-hero__label">Si vous vendez aujourd’hui à ${esc(euroRound(now.price))}</div>
      <div class="cost-hero__value ${now.gain >= 0 ? 'is-pos' : 'is-neg'}">${esc(signed(now.gain))}</div>
      <p class="cost-hero__note">${now.gain >= 0 ? 'Vous récupérez toute votre mise, et plus.' : 'Il manque cette somme pour récupérer tout l’argent investi.'}</p>
      <div class="kpis">
        <div class="kpi"><span>Net vendeur</span><strong>${esc(euroShort(now.net))}</strong><small>après crédit soldé</small></div>
        <div class="kpi"><span>Investi</span><strong>${esc(euroShort(now.invested))}</strong><small>apport + échéances</small></div>
        <div class="kpi"><span>Capital dû</span><strong>${esc(euroShort(now.crd))}</strong><small>+ ${esc(euroRound(now.ira))} d’IRA</small></div>
      </div>
    </div>
    ${milestoneHtml('Opération à zéro', a.zero, now, 'zeroPrice', 'Le prix de vente rembourse le crédit et vous rend tout l’argent investi (apport, échéances payées' + (settings.includeWorks ? ', travaux' : '') + ').')}
    ${milestoneHtml('Solder le crédit sans remettre d’argent', a.clear, now, 'clearPrice', 'Le prix couvre le capital restant dû, les indemnités et les frais de vente.')}
    ${!settings.growth && !a.zero.reached ? `<p class="pj-warning">${icon('info', 18)}<span>Sans hausse du prix, chaque mois coûte des intérêts : l’opération à zéro ne s’atteint qu’avec une valorisation du bien. Essayez une évolution de 1 à 2 %/an.</span></p>` : ''}`;

  // Courbes : un point par trimestre
  const pts = a.future.filter((_, i) => i % 3 === 0);
  const zeroIndex = a.zero.at ? pts.findIndex(p => p.month >= a.zero.at.month) : -1;
  renderLines(
    $('#resaleChart'),
    pts.map(p => ({ label: p.month.slice(0, 4), title: shortMonth(p.month), values: { price: p.price, zero: p.zeroPrice, clear: p.clearPrice }, extra: `<span class="chart-tip__row chart-tip__total">Résultat<b>${esc(signed(p.gain))}</b></span>` })),
    {
      series: [
        { key: 'price', label: 'Prix de vente estimé', color: PALETTE[0] },
        { key: 'zero', label: 'Prix pour l’opération à zéro', color: PALETTE[1] },
        { key: 'clear', label: 'Prix pour solder le crédit', color: PALETTE[3], dash: true }
      ],
      fmt: euroRound,
      axisFmt: euroShort,
      tickEvery: 12,
      marker: zeroIndex > 0 ? { index: zeroIndex, label: 'Opération à zéro' } : null
    }
  );

  // Tableau : aujourd'hui puis chaque année
  const yearly = a.future.filter((_, i) => i % 12 === 0).slice(0, 26);
  $('#resaleTable').innerHTML = `
    <div class="resale-row resale-row--head"><span>Vente</span><span>Prix</span><span>Capital dû</span><span>Résultat</span></div>
    ${yearly
      .map(
        p => `<div class="resale-row ${a.zero.at && p.month === yearly.find(x => x.month >= a.zero.at.month)?.month ? 'is-mark' : ''}"><span>${esc(shortMonth(p.month))}</span><span>${esc(euroShort(p.price))}</span><span>${esc(euroShort(p.crd))}</span><span class="${p.gain >= 0 ? 'is-pos' : 'is-neg'}">${esc(signedShort(p.gain))}</span></div>`
      )
      .join('')}`;
}

export function renderResale() {
  if (!formBuilt || !saveTimer) settings = current();
  if (!formBuilt || !$('#resaleForm').contains(document.activeElement)) buildForm();
  renderResults();
}

/* ---------- Saisie ---------- */
function flush() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  store.set('resale', settings);
}
function onInput(e) {
  const el = e.target.closest('[data-r]');
  if (!el) return;
  const key = el.dataset.r;
  if (el.type === 'checkbox') settings[key] = el.checked;
  else if (el.tagName === 'SELECT') settings[key] = el.value;
  else settings[key] = toNumber(el.value) || 0;
  renderResults();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}

/* ---------- Import du tableau d'amortissement ---------- */
function colOptions(selected) {
  return importState.analysis.columns
    .map((col, k) => `<option value="${k}" ${k === selected ? 'selected' : ''}>Colonne ${k + 1} : ${col.slice(0, 3).map(v => v.toLocaleString('fr-FR')).join(' · ')}…</option>`)
    .join('');
}

function renderImport() {
  const { analysis: an, payment, remaining, firstDate } = importState;
  if (!an.rows.length) {
    $('#importBody').innerHTML = `<p class="pj-warning is-late">${icon('alert', 18)}<span>Aucun tableau reconnu dans ce fichier. Essayez la version Excel/CSV de la banque, ou collez le texte du tableau.</span></p>`;
    $('#importConfirm').disabled = true;
    return;
  }
  const rows = buildRows(an, { payment, remaining, firstDate });
  const preview = rows.length > 5 ? [...rows.slice(0, 3), null, ...rows.slice(-2)] : rows;
  $('#importBody').innerHTML = `
    <p class="sheet__sub">${an.rows.length} lignes reconnues${rows.length ? ` · ${esc(shortMonth(rows[0][0].slice(0, 7)))} → ${esc(shortMonth(rows[rows.length - 1][0].slice(0, 7)))}` : ''}</p>
    <div class="field"><label class="field__label" for="imPayment">Colonne « échéance » (montant payé chaque mois)</label><select class="input select" id="imPayment" data-im="payment">${colOptions(payment)}</select></div>
    <div class="field"><label class="field__label" for="imRemaining">Colonne « capital restant dû »</label><select class="input select" id="imRemaining" data-im="remaining">${colOptions(remaining)}</select></div>
    ${an.hasDates ? '' : `<div class="field"><label class="field__label" for="imFirst">Date de la 1ʳᵉ échéance (le tableau n’a pas de dates)</label><input class="input" type="date" id="imFirst" data-im="firstDate" value="${esc(firstDate || '')}"></div>`}
    <div class="card card--list import-preview">
      <div class="resale-row resale-row--head"><span>Date</span><span>Échéance</span><span>Capital dû</span></div>
      ${preview.map(r => (r ? `<div class="resale-row"><span>${esc(formatKey(r[0]))}</span><span>${esc(euro(r[1]))}</span><span>${esc(euro(r[2]))}</span></div>` : '<div class="resale-row resale-row--gap"><span>…</span></div>')).join('')}
    </div>`;
  $('#importConfirm').disabled = !rows.length || payment < 0 || remaining < 0;
}

function startImport(rawRows, source) {
  const an = analyze(rawRows);
  importState = { analysis: an, source, payment: an.guess.payment, remaining: an.guess.remaining, firstDate: store.home()?.loanStart || '' };
  if (importState.payment < 0) importState.payment = 0;
  if (importState.remaining < 0) importState.remaining = Math.max(0, an.columns.length - 1);
  renderImport();
  openSheet('importSheet', { focus: false });
}

async function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const t = toast('Lecture du tableau…', { type: 'loading' });
  try {
    const rows = await rowsFromFile(file);
    t.close();
    startImport(rows, file.name);
  } catch (error) {
    console.error(error);
    t.update(`Lecture impossible : ${error.message}`, 'error');
  }
}

async function confirmImport() {
  const rows = buildRows(importState.analysis, importState);
  if (!rows.length) return;
  store.set('amortization', { source: importState.source.slice(0, 120), importedAt: Date.now(), rows });
  closeSheet('importSheet');
  toast(`${rows.length} échéances importées`);
}

export function initResale() {
  $('#resaleForm').addEventListener('input', onInput);
  $('#resaleForm').addEventListener('change', e => e.target.matches('select, [type="checkbox"]') && onInput(e));
  $('#resaleForm').addEventListener('focusout', e => {
    const el = e.target.closest('input[data-r]:not([type="checkbox"])');
    if (el) el.value = numInput(settings[el.dataset.r]);
  });
  $('#amortFile').addEventListener('change', onFile);
  $('#amortPaste').addEventListener('click', () => {
    $('#pasteText').value = '';
    openSheet('pasteSheet', { focus: false });
  });
  $('#pasteForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#pasteText').value;
    if (!text.trim()) return;
    closeSheet('pasteSheet');
    startImport(rowsFromText(text), 'texte collé');
  });
  $('#amortClear').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Supprimer le tableau importé ?', message: 'Le calcul reprendra depuis la fiche de la maison.', confirmLabel: 'Supprimer', danger: true }))) return;
    store.set('amortization', null);
    toast('Tableau supprimé');
  });
  $('#importBody').addEventListener('change', e => {
    const el = e.target.closest('[data-im]');
    if (!el) return;
    importState[el.dataset.im] = el.dataset.im === 'firstDate' ? el.value : Number(el.value);
    renderImport();
  });
  $('#importConfirm').addEventListener('click', confirmImport);
  window.addEventListener('pagehide', flush);
}

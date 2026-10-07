/*
 * Crédit & revente, version minimale : le crédit en cours (tableau
 * d'amortissement importé ou calculé depuis la fiche) et la date de
 * l'« opération à zéro » — le mois à partir duquel revendre au prix d'achat
 * ne fait plus rien perdre : le capital déjà remboursé couvre les frais
 * perdus (intérêts et assurance payés, frais d'achat, indemnités de
 * remboursement anticipé).
 */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { formatKey } from '../core/dates.js';
import { zeroOperation } from '../core/calc.js';
import { rowsFromFile, rowsFromText, analyze, buildRows } from '../features/amortization-import.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { euro, euroRound, numInput, toNumber } from './common.js';

const monthLabel = m => formatKey(`${m}-01`, { month: 'long', year: 'numeric' });
const shortMonth = m => formatKey(`${m}-01`, { month: 'short', year: 'numeric' });
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
const fact = (label, value, cls = '') => `<div class="fact ${cls}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;

let importState = null;

/** « dans 2 ans et 3 mois » entre deux mois AAAA-MM. */
function inYears(month, nowMonth) {
  const [y1, m1] = nowMonth.split('-').map(Number);
  const [y2, m2] = month.split('-').map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  if (months < 12) return `dans ${months} mois`;
  const y = Math.floor(months / 12);
  const r = months % 12;
  return `dans ${y} an${y > 1 ? 's' : ''}${r ? ` et ${r} mois` : ''}`;
}

function renderZero(z) {
  const h = store.home();
  if (!z) {
    $('#zeroCard').innerHTML = `<p class="zero-card__kicker">Opération à zéro</p><p class="zero-card__empty">Importez le tableau d’amortissement de la banque, ou renseignez le crédit en cours dans la fiche de la maison.</p>`;
    return;
  }
  const { now, zero } = z;
  const reached = zero && zero.month <= now.month;
  const main = reached ? 'Atteinte' : zero ? capitalize(monthLabel(zero.month)) : 'Pas avant la fin du crédit';
  const sub = reached ? `depuis ${monthLabel(zero.month)}` : zero ? inYears(zero.month, now.month) : 'le capital remboursé ne couvre pas les frais';
  const ratio = now.lost ? Math.min(1, now.capital / now.lost) : 1;
  $('#zeroCard').innerHTML = `
    <p class="zero-card__kicker">Opération à zéro</p>
    <p class="zero-card__main ${reached ? 'is-pos' : ''}">${esc(main)}</p>
    <p class="zero-card__sub">${esc(sub)}</p>
    <div class="zero-card__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}" aria-label="Capital remboursé par rapport aux frais perdus"><span style="--value:${Math.round(ratio * 100)}%"></span></div>
    <div class="zero-card__figures">
      <div><span>Capital remboursé</span><strong>${esc(euroRound(now.capital))}</strong></div>
      <div><span>Frais perdus</span><strong>${esc(euroRound(now.lost))}</strong></div>
    </div>
    ${h?.purchaseFees ? '' : `<p class="zero-card__hint">${icon('info', 14)}<span>Frais d’achat (notaire, agence) à renseigner dans la fiche de la maison.</span></p>`}`;
}

function renderLoan(z) {
  const imported = store.get('amortization');
  $('#amortClear').hidden = !imported;
  if (!z) {
    $('#loanCard').innerHTML = '';
    $('#loanCard').hidden = true;
    return;
  }
  const paidShare = z.principal ? Math.max(0, Math.min(100, Math.round((1 - z.now.crd / z.principal) * 100))) : 0;
  $('#loanCard').hidden = false;
  $('#loanCard').innerHTML = `
    <dl class="facts">
      ${fact('Capital restant dû', euro(z.now.crd), 'fact--total')}
      ${fact('Mensualité', euro(z.now.payment))}
      ${fact('Fin du crédit', capitalize(shortMonth(z.end)))}
    </dl>
    <div class="finance-progress"><div class="due__bar"><span style="--value:${paidShare}%"></span></div><p class="card__sub">${paidShare} % remboursé · ${imported ? 'tableau de la banque' : 'calculé depuis la fiche'}</p></div>`;
}

export function renderResale() {
  const z = zeroOperation({ home: store.home(), amortization: store.get('amortization') });
  renderZero(z);
  renderLoan(z);
}

/* ---------- Import du tableau d'amortissement ---------- */
function colOptions(selected) {
  return importState.analysis.columns
    .map((col, k) => `<option value="${k}" ${k === selected ? 'selected' : ''}>Colonne ${k + 1} : ${col.slice(0, 3).map(v => v.toLocaleString('fr-FR')).join(' · ')}…</option>`)
    .join('');
}

function renderImport() {
  const st = importState;
  const an = st.analysis;
  if (!an.rows.length) {
    $('#importBody').innerHTML = `<p class="pj-warning is-late">${icon('alert', 18)}<span>Aucun tableau reconnu dans ce fichier. Essayez la version Excel/CSV de la banque, ou collez le texte du tableau.</span></p>`;
    $('#importConfirm').disabled = true;
    return;
  }
  const { rows, past, start } = buildRows(an, st);
  const preview = rows.length > 6 ? [...rows.slice(0, 2), null, ...rows.slice(past, past + 2), null, ...rows.slice(-2)].filter((r, i, arr) => r || arr[i - 1]) : rows;
  const options = (list, selected) => list.map(([v, l]) => `<option value="${v}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#importBody').innerHTML = `
    <p class="sheet__sub">${an.rows.length} échéances lues${rows.length ? ` · ${esc(shortMonth(rows[past][0].slice(0, 7)))} → ${esc(shortMonth(rows[rows.length - 1][0].slice(0, 7)))}` : ''}</p>
    ${past ? `<p class="pj-warning is-ok">${icon('check', 18)}<span>Le tableau commence à l’échéance n° ${past + 1} : les <b>${past} échéances déjà payées</b> (depuis ${esc(monthLabel(start.slice(0, 7)))}) sont reconstituées à partir du montant emprunté et du taux.</span></p>` : ''}
    <div class="form-grid">
      <div class="field"><label class="field__label" for="imPrincipal">Montant emprunté · €</label><input class="input" id="imPrincipal" data-im="principal" inputmode="decimal" value="${esc(numInput(st.principal))}"></div>
      <div class="field"><label class="field__label" for="imRate">Taux · %</label><input class="input" id="imRate" data-im="rate" inputmode="decimal" value="${esc(numInput(st.rate))}"></div>
    </div>
    <div class="field"><label class="field__label" for="imPayment">Colonne « échéance » (montant prélevé chaque mois)</label><select class="input select" id="imPayment" data-im="payment">${colOptions(st.payment)}</select></div>
    <div class="field"><label class="field__label" for="imRemaining">Colonne « capital restant dû »</label><select class="input select" id="imRemaining" data-im="remaining">${colOptions(st.remaining)}</select></div>
    <div class="field"><label class="field__label" for="imPosition">Ce capital dû est indiqué</label><select class="input select" id="imPosition" data-im="position">${options([['before', 'avant l’échéance du mois'], ['after', 'après l’échéance du mois']], st.position)}</select></div>
    ${an.hasDates ? '' : `<div class="field"><label class="field__label" for="imFirst">Date de la 1ʳᵉ échéance (le tableau n’a pas de dates)</label><input class="input" type="date" id="imFirst" data-im="firstDate" value="${esc(st.firstDate || '')}"></div>`}
    <div class="card card--list import-preview">
      <div class="resale-row resale-row--head"><span>Date</span><span>Échéance</span><span>Dû après</span></div>
      ${preview.map(r => (r ? `<div class="resale-row ${rows.indexOf(r) < past ? 'is-estimated' : ''}"><span>${esc(formatKey(r[0]))}</span><span>${esc(euro(r[1]))}</span><span>${esc(euro(r[2]))}</span></div>` : '<div class="resale-row resale-row--gap"><span>…</span></div>')).join('')}
    </div>
    ${past ? '<p class="field__help">En italique : échéances reconstituées.</p>' : ''}`;
  $('#importConfirm').disabled = !rows.length || st.payment < 0 || st.remaining < 0;
}

function startImport(rawRows, source) {
  const meta = rawRows.meta || {};
  const an = analyze(rawRows, meta);
  const h = store.home();
  importState = {
    analysis: an,
    source,
    ...an.guess,
    firstDate: h?.loanStart || '',
    principal: meta.principal || h?.loanPrincipal || 0,
    rate: meta.rate || h?.loanRate || 0
  };
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
  const st = importState;
  const { rows, past, start } = buildRows(st.analysis, st);
  if (!rows.length) return;
  store.set('amortization', { source: st.source.slice(0, 120), importedAt: Date.now(), rows, past, principal: st.principal, rate: st.rate });
  // Fiche maison : crédit complété s'il n'était pas renseigné.
  const h = store.home();
  if (h && !h.loanPrincipal && st.principal) store.set('home', { ...h, loanPrincipal: st.principal, loanRate: st.rate, loanMonths: rows.length, loanStart: start });
  closeSheet('importSheet');
  toast(`${rows.length} échéances importées${past ? ` (dont ${past} reconstituées)` : ''}`);
}

export function initResale() {
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
    const key = el.dataset.im;
    importState[key] = key === 'firstDate' || key === 'position' ? el.value : key === 'principal' || key === 'rate' ? toNumber(el.value) || 0 : Number(el.value);
    renderImport();
  });
  $('#importConfirm').addEventListener('click', confirmImport);
}

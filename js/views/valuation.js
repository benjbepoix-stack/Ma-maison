/* Estimation de la valeur : ventes du quartier (DVF), prix d'achat indexé, estimation manuelle. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { formatKey } from '../core/dates.js';
import { valuationSummary } from '../core/calc.js';
import { fetchValuation } from '../services/valuation.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { euroRound, intFmt, toNumber, numInput, pct } from './common.js';

const REFRESH_DAYS = 30;
const SOURCE_LABEL = { manual: 'votre estimation', dvf: 'ventes du quartier', indexed: 'prix d’achat indexé', purchase: 'prix d’achat', none: '' };
let loading = false;
let autoTried = false;
let lastError = '';

const current = () => store.get('valuation') || { result: null, manualM2: 0, correctionPct: 0, useDpe: true };

/** Valeur retenue (utilisée par l'accueil, la revente et le projet d'achat). */
export const retainedValue = () => valuationSummary(store.home(), store.get('valuation'));

const shortMonth = d => (d ? formatKey(d, { month: 'short', year: 'numeric' }) : '');

export async function refreshValuation({ silent = false } = {}) {
  const h = store.home();
  if (!h?.address) {
    if (!silent) toastError('Renseignez l’adresse dans la fiche de la maison.');
    return;
  }
  if (loading) return;
  loading = true;
  lastError = '';
  renderValuation();
  try {
    const result = await fetchValuation(h.address);
    store.set('valuation', { ...current(), result });
    if (!silent) toast(`${result.count} ventes analysées à ${result.city}`);
  } catch (error) {
    console.warn('[valorisation]', error);
    lastError = /fetch|network|abort|HTTP|cors/i.test(String(error?.message || error)) ? 'Données des ventes injoignables pour le moment. Vous pouvez saisir le prix au m² du quartier dans les réglages.' : error.message;
    if (!silent) toastError(lastError);
  } finally {
    loading = false;
    renderValuation();
  }
}

export function renderValuation() {
  const h = store.home();
  const host = $('#valuationCard');
  if (!h) {
    host.innerHTML = '<div class="empty-state"><p>Créez la fiche de la maison pour estimer sa valeur.</p></div>';
    return;
  }
  const v = valuationSummary(h, store.get('valuation'));
  const r = v.result;
  // Mise à jour automatique (une fois par session) si les données ont plus de 30 jours.
  if (!autoTried && h.address && h.surface && (!r || Date.now() - r.fetchedAt > REFRESH_DAYS * 864e5)) {
    autoTried = true;
    setTimeout(() => refreshValuation({ silent: true }), 600);
  }
  const line = (label, value, sub, active) => `<div class="val-line ${active ? 'is-active' : ''}"><div><span class="val-line__label">${esc(label)}</span><span class="val-line__sub">${sub}</span></div><strong>${value ? esc(euroRound(value)) : '—'}</strong></div>`;
  const dvfSub = !h.surface
    ? 'Renseignez la surface habitable dans la fiche'
    : !h.address && !v.m2
      ? 'Renseignez l’adresse dans la fiche'
      : v.m2
        ? esc(`${intFmt(v.m2)} €/m² × ${intFmt(h.surface)} m²${v.dpe ? ` · DPE ${h.dpe} ${v.dpe > 0 ? '+' : ''}${v.dpe} %` : ''}${v.correction ? ` · correction ${v.correction > 0 ? '+' : ''}${v.correction} %` : ''}`) +
          (r && !store.get('valuation')?.manualM2 ? `<br>${esc(`médiane de ${r.count} ventes ${r.radius ? `à moins de ${r.radius / 1000} km` : `à ${r.city}`} · ${shortMonth(r.from)} → ${shortMonth(r.to)} · fourchette ${intFmt(r.p25)}–${intFmt(r.p75)} €/m²`)}` : store.get('valuation')?.manualM2 ? '<br>prix au m² saisi manuellement' : '')
        : loading
          ? 'Recherche des ventes…'
          : esc(lastError || 'Touchez « Actualiser » pour chercher les ventes du quartier');
  const idxSub = v.evolution
    ? esc(`${v.evolution.pct >= 0 ? "+" : ""}${pct(v.evolution.pct)} à ${r.city} entre ${v.evolution.from} et ${v.evolution.to}${v.evolution.exact ? '' : ' (année d’achat non couverte)'}`)
    : h.purchasePrice
      ? 'Disponible après la recherche des ventes'
      : 'Renseignez le prix d’achat dans la fiche';
  host.innerHTML = `
    <div class="val-hero">
      <div><span class="cost-hero__label">Valeur retenue</span><div class="val-hero__value">${v.value ? esc(euroRound(v.value)) : '—'}</div><span class="val-hero__src">${esc(SOURCE_LABEL[v.source])}</span></div>
      <div class="val-hero__actions">
        <button type="button" class="icon-btn icon-btn--sm" data-val="refresh" aria-label="Actualiser l’estimation" ${loading ? 'disabled' : ''}>${loading ? '<span class="spinner spinner--sm"></span>' : icon('refresh', 17)}</button>
        <button type="button" class="icon-btn icon-btn--sm" data-val="settings" aria-label="Réglages de l’estimation">${icon('settings', 17)}</button>
      </div>
    </div>
    ${line('Ventes du quartier', v.dvf, dvfSub, v.source === 'dvf')}
    ${line('Prix d’achat indexé', v.indexed, idxSub, v.source === 'indexed')}
    ${line('Votre estimation', v.manual, v.manual ? 'prioritaire sur les deux autres' : 'à saisir dans la fiche si vous avez une estimation d’agence', v.source === 'manual')}`;
}

/* ---------- Réglages ---------- */
function openSettings() {
  const v = current();
  const form = $('#valuationForm');
  form.elements.correctionPct.value = numInput(v.correctionPct);
  form.elements.manualM2.value = numInput(v.manualM2);
  form.elements.useDpe.checked = v.useDpe;
  openSheet('valuationSheet', { focus: false });
}

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const correctionPct = Math.max(-50, Math.min(50, toNumber(form.elements.correctionPct.value) || 0));
  store.set('valuation', { ...current(), correctionPct, manualM2: Math.max(0, toNumber(form.elements.manualM2.value) || 0), useDpe: form.elements.useDpe.checked });
  closeSheet('valuationSheet');
  toast('Estimation mise à jour');
}

export function initValuation() {
  $('#valuationForm').addEventListener('submit', onSubmit);
  $('#valuationCard').addEventListener('click', e => {
    const a = e.target.closest('[data-val]')?.dataset.val;
    if (a === 'refresh') refreshValuation();
    else if (a === 'settings') openSettings();
  });
}

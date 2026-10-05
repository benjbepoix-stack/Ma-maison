/* Utilitaires d'affichage partagés. */
import { parseNumber } from '../core/utils.js';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eurRound = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Montants ronds sans décimales (180 €), sinon deux décimales (75,50 €). */
export const euro = v => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return Number.isInteger(n) ? eurRound.format(n) : eur.format(n);
};
export const euroRound = v => eurRound.format(Math.round(Number(v) || 0));
/** Montant compact pour les axes et KPI : 12 k€, 1,2 M€. */
export function euroShort(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`;
  if (Math.abs(n) >= 1e4) return `${int.format(n / 1e3)} k€`;
  return euroRound(n);
}
export const intFmt = v => int.format(Math.round(Number(v) || 0));
export const pct = (v, d = 1) => `${(Number(v) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d })} %`;

/** Saisie « 12,5 » / « 75 000 » -> nombre (2 décimales max), sinon null. */
export function toNumber(v) {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n * 100) / 100;
}
export const numInput = n => (n ? String(n).replace('.', ',') : '');

export const LEVEL_LABEL = { late: 'En retard', soon: 'Bientôt', ok: 'À jour', unknown: 'À renseigner', none: 'Sans échéance' };

/** Validation « nombre positif » pour les champs numériques facultatifs. */
export const positive = (label, { required = false, max = 1e9, integer = false } = {}) => v => {
  if (v === '' || v === null || v === undefined) return required ? `${label} est obligatoire.` : null;
  const n = parseNumber(v);
  if (n === null || n < 0) return 'Nombre positif attendu.';
  if (integer && !Number.isInteger(n)) return 'Nombre entier attendu.';
  if (n > max) return `Maximum ${int.format(max)}.`;
  return null;
};

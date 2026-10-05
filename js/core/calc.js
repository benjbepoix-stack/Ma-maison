/*
 * Calculs purs : échéances d'entretien, chiffrage des travaux, crédit
 * immobilier (mensualité, capacité d'emprunt, tableau d'amortissement).
 */
import { todayKey, fromKey } from './dates.js';
import { NOTARY_RATE, MAX_DEBT_RATIO } from './schema.js';

/* ---------- Dates ---------- */
export function addMonthsToDate(dateKey, n) {
  const d = fromKey(dateKey);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const daysUntil = (dateKey, today = todayKey()) => Math.round((fromKey(dateKey) - fromKey(today)) / 86400000);
export function monthsBetween(fromDate, toDate) {
  const a = fromKey(fromDate);
  const b = fromKey(toDate);
  if (!a || !b) return 0;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1);
}

/* ---------- Entretien ---------- */
export const SOON_DAYS = 30;

/** { level: late|soon|ok|unknown|none, nextDate, days, ratio } */
export function reminderStatus(r, today = todayKey()) {
  if (!r.everyMonths) return { level: 'none', nextDate: '', days: null, ratio: 0 };
  if (!r.lastDate) return { level: 'unknown', nextDate: '', days: null, ratio: 0 };
  const nextDate = addMonthsToDate(r.lastDate, r.everyMonths);
  const days = daysUntil(nextDate, today);
  const span = Math.max(1, daysUntil(nextDate, r.lastDate));
  const ratio = Math.max(0, Math.min(1, 1 - days / span));
  const level = days < 0 ? 'late' : days <= Math.min(SOON_DAYS, span / 3) ? 'soon' : 'ok';
  return { level, nextDate, days, ratio };
}

const LEVEL_ORDER = { late: 0, soon: 1, unknown: 2, ok: 3, none: 4 };
export const byUrgency = (a, b) => LEVEL_ORDER[a.status.level] - LEVEL_ORDER[b.status.level] || (a.status.days ?? 1e9) - (b.status.days ?? 1e9);

export function dueText(s) {
  if (s.level === 'unknown') return 'Date du dernier passage à renseigner';
  if (s.level === 'none') return 'Sans périodicité';
  if (s.days < 0) return `En retard de ${-s.days} jour${-s.days > 1 ? 's' : ''}`;
  if (s.days === 0) return 'À faire aujourd’hui';
  return `Dans ${s.days} jour${s.days > 1 ? 's' : ''}`;
}

/** Rappels triés du plus urgent au moins urgent, avec leur statut. */
export const reminderAlerts = reminders => reminders.map(r => ({ ...r, status: reminderStatus(r) })).sort(byUrgency);

/* ---------- Travaux ---------- */
/**
 * Chiffrage d'un projet : postes HT → TVA → imprévus → aides → reste à charge.
 * Les imprévus s'appliquent au TTC (marge de sécurité sur le budget réel).
 */
export function workTotals(w) {
  const byKind = { materials: 0, labour: 0, other: 0 };
  w.lines.forEach(l => (byKind[l.kind] += l.qty * l.unitPrice));
  const ht = byKind.materials + byKind.labour + byKind.other;
  const vat = (ht * (w.vat || 0)) / 100;
  const ttc = ht + vat;
  const contingency = (ttc * (w.contingency || 0)) / 100;
  const budget = ttc + contingency;
  const net = Math.max(0, budget - (w.aids || 0));
  return { byKind, ht, vat, ttc, contingency, budget, net, aids: w.aids || 0, spent: w.spent || 0 };
}

/** Épargne mensuelle à mettre de côté pour financer le reste à charge avant la date visée. */
export function monthlySaving(w, today = todayKey()) {
  if (!w.targetDate || w.status === 'done') return null;
  const months = monthsBetween(today, w.targetDate);
  if (months < 1) return null;
  return { months, amount: workTotals(w).net / months };
}

/* ---------- Crédit ---------- */
/** Mensualité hors assurance (taux annuel en %, durée en mois). */
export function payment(principal, ratePct, months) {
  if (!principal || !months) return 0;
  const r = ratePct / 1200;
  return r ? (principal * r) / (1 - Math.pow(1 + r, -months)) : principal / months;
}

/** Capital emprunté maximal pour une mensualité donnée (assurance incluse, calculée sur le capital initial). */
export function maxPrincipal(monthlyBudget, ratePct, months, insuranceRatePct = 0) {
  if (monthlyBudget <= 0 || !months) return 0;
  const r = ratePct / 1200;
  const factor = (r ? r / (1 - Math.pow(1 + r, -months)) : 1 / months) + insuranceRatePct / 1200;
  return monthlyBudget / factor;
}

/** Capital restant dû après `elapsed` mensualités. */
export function remainingPrincipal(principal, ratePct, months, elapsed) {
  if (!principal || !months) return 0;
  const k = Math.max(0, Math.min(months, elapsed));
  const r = ratePct / 1200;
  if (!r) return principal * (1 - k / months);
  const m = payment(principal, ratePct, months);
  return Math.max(0, principal * Math.pow(1 + r, k) - (m * (Math.pow(1 + r, k) - 1)) / r);
}

/** Crédit en cours de la maison actuelle : capital restant dû aujourd'hui. */
export function currentLoan(home, today = todayKey()) {
  if (!home?.loanPrincipal || !home.loanMonths) return null;
  const elapsed = home.loanStart ? Math.max(0, monthsBetween(home.loanStart, today) + 1) : 0;
  const monthly = payment(home.loanPrincipal, home.loanRate, home.loanMonths);
  const remaining = elapsed >= home.loanMonths ? 0 : remainingPrincipal(home.loanPrincipal, home.loanRate, home.loanMonths, elapsed);
  return { monthly, remaining, elapsed: Math.min(elapsed, home.loanMonths), months: home.loanMonths, done: elapsed >= home.loanMonths };
}

/** Tableau d'amortissement agrégé par année : [{ year, interest, principal, insurance, remaining }]. */
export function amortizationByYear(principal, ratePct, months, insuranceRatePct = 0) {
  const rows = [];
  const r = ratePct / 1200;
  const m = payment(principal, ratePct, months);
  const ins = (principal * insuranceRatePct) / 1200;
  let remaining = principal;
  for (let k = 0; k < months; k++) {
    const interest = remaining * r;
    const capital = Math.min(remaining, m - interest);
    remaining -= capital;
    const y = Math.floor(k / 12);
    rows[y] ??= { year: y + 1, interest: 0, principal: 0, insurance: 0, remaining: 0 };
    rows[y].interest += interest;
    rows[y].principal += capital;
    rows[y].insurance += ins;
    rows[y].remaining = Math.max(0, remaining);
  }
  return rows;
}

/**
 * Simulation complète d'un achat immobilier.
 * Coût de l'opération = prix + notaire + agence (si à la charge de l'acheteur) + travaux + mobilier
 * + garantie + frais de dossier. Apport = épargne + produit net de la vente de la maison actuelle.
 */
export function simulate(p, home, today = todayKey()) {
  const notaryAuto = (p.price * NOTARY_RATE[p.kind]) / 100;
  const notary = p.notaryOverride || notaryAuto;
  const months = Math.round(p.years * 12);

  // Vente de la maison actuelle : prix - frais de vente - capital restant dû
  const loan = currentLoan(home, today);
  const saleRemaining = p.useSale ? loan?.remaining || 0 : 0;
  const saleNet = p.useSale ? Math.max(0, p.salePrice - p.saleFees - saleRemaining) : 0;
  const contribution = p.savings + saleNet;

  // Garantie (caution) calculée sur le montant emprunté : on résout l'équation
  // emprunt = besoin + garantie(emprunt) en une passe.
  const baseCost = p.price + notary + p.agencyFees + p.works + p.furniture + p.fileFees;
  const needBeforeGuarantee = Math.max(0, baseCost - contribution);
  const g = p.guaranteePct / 100;
  const principal = g < 1 ? needBeforeGuarantee / (1 - g) : needBeforeGuarantee;
  const guarantee = principal * g;
  const total = baseCost + guarantee;

  const monthlyLoan = payment(principal, p.rate, months);
  const monthlyInsurance = (principal * p.insuranceRate) / 1200;
  const monthly = monthlyLoan + monthlyInsurance;
  const interest = monthlyLoan * months - principal;
  const insurance = monthlyInsurance * months;
  const creditCost = interest + insurance + guarantee + p.fileFees;

  const debtRatio = p.income ? ((monthly + p.otherLoans) / p.income) * 100 : null;
  const maxMonthly = (p.income * MAX_DEBT_RATIO) / 100 - p.otherLoans;
  const capacity = maxPrincipal(maxMonthly, p.rate, months, p.insuranceRate);
  const requiredIncome = ((monthly + p.otherLoans) * 100) / MAX_DEBT_RATIO;
  const housingMonthly = monthly + p.propertyTax / 12 + p.charges;
  const restToLive = p.income ? p.income - monthly - p.otherLoans - p.propertyTax / 12 - p.charges : null;
  const contributionPct = total ? (contribution / total) * 100 : 0;

  return {
    notary,
    notaryAuto,
    months,
    loan,
    saleRemaining,
    saleNet,
    contribution,
    contributionPct,
    principal,
    guarantee,
    total,
    monthlyLoan,
    monthlyInsurance,
    monthly,
    interest,
    insurance,
    creditCost,
    debtRatio,
    maxMonthly,
    capacity,
    requiredIncome,
    housingMonthly,
    restToLive,
    excess: contribution > baseCost ? contribution - baseCost : 0
  };
}

/* ---------- Énergie & charges ---------- */
const PER_YEAR = { monthly: 12, quarterly: 4, yearly: 1 };
const monthKey = d => d.slice(0, 7);
function addMonthsToMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** Une charge récurrente est-elle active pendant le mois donné (AAAA-MM) ? */
const activeIn = (r, month) => (!r.since || monthKey(r.since) <= month) && (!r.until || monthKey(r.until) >= month);
export const recurringMonthly = r => (r.amount * PER_YEAR[r.frequency]) / 12;

/**
 * Charges par mois sur une année : factures ponctuelles au mois de leur date,
 * charges récurrentes lissées au mois (montant annuel / 12).
 * @returns {Array<{month, byCategory: Record<string,number>, total}>}
 */
export function chargesByMonth(charges, recurring, year) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const byCategory = {};
    const add = (cat, v) => (byCategory[cat] = (byCategory[cat] || 0) + v);
    charges.filter(c => monthKey(c.date) === month).forEach(c => add(c.category, c.amount));
    recurring.filter(r => activeIn(r, month)).forEach(r => add(r.category, recurringMonthly(r)));
    return { month, byCategory, total: Object.values(byCategory).reduce((s, v) => s + v, 0) };
  });
}

/** Totaux sur les 12 derniers mois glissants (mois en cours inclus). */
export function chargesLast12(charges, recurring, today = todayKey()) {
  const end = monthKey(today);
  const start = addMonthsToMonth(end, -11);
  const byCategory = {};
  const add = (cat, v) => (byCategory[cat] = (byCategory[cat] || 0) + v);
  charges.filter(c => monthKey(c.date) >= start && monthKey(c.date) <= end).forEach(c => add(c.category, c.amount));
  for (let k = 0; k < 12; k++) {
    const month = addMonthsToMonth(start, k);
    recurring.filter(r => activeIn(r, month)).forEach(r => add(r.category, recurringMonthly(r)));
  }
  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
  return { byCategory, total, monthly: total / 12 };
}

/* ---------- Échéancier du crédit (importé ou calculé) ---------- */
/**
 * Échéancier mensuel [{ date, payment, remaining }] : le tableau
 * d'amortissement importé s'il existe, sinon calculé depuis la fiche maison.
 */
export function loanRows(home, amortization) {
  if (amortization?.rows?.length) return amortization.rows.map(([date, payment, remaining]) => ({ date, payment, remaining }));
  if (!home?.loanPrincipal || !home.loanMonths || !home.loanStart) return [];
  const m = payment(home.loanPrincipal, home.loanRate, home.loanMonths);
  return Array.from({ length: home.loanMonths }, (_, k) => ({ date: addMonthsToDate(home.loanStart, k), payment: m, remaining: remainingPrincipal(home.loanPrincipal, home.loanRate, home.loanMonths, k + 1) }));
}

/** Taux annuel déduit de l'échéancier (intérêts du mois / capital restant dû), en %. */
export function inferRate(rows) {
  const rates = [];
  for (let i = 1; i < Math.min(rows.length, 25); i++) {
    const prev = rows[i - 1].remaining;
    const interest = rows[i].payment - (prev - rows[i].remaining);
    if (prev > 0 && interest > 0) rates.push((interest / prev) * 1200);
  }
  if (!rates.length) return 0;
  rates.sort((a, b) => a - b);
  return rates[Math.floor(rates.length / 2)];
}

/**
 * Analyse de revente mois par mois, d'aujourd'hui à la fin du crédit (+ 2 ans).
 * - Net vendeur = prix − frais de vente − capital restant dû − indemnités de remboursement anticipé.
 * - Argent investi = apport initial + mensualités payées + (option) travaux réalisés,
 *   entretien, taxe foncière.
 * - « Solder le crédit » : le prix couvre le capital restant dû, les IRA et les frais.
 * - « Opération à zéro » : le net vendeur rembourse tout l'argent investi.
 * IRA légales (art. L313-48 C. conso.) : min(6 mois d'intérêts, 3 % du capital remboursé par anticipation).
 */
export function resaleAnalysis({ home, amortization, resale, works = [], maintenance = [], taxPerYear = 0 }, today = todayKey()) {
  const rows = loanRows(home, amortization);
  const rate = home?.loanRate || inferRate(rows);
  const principal = home?.loanPrincipal || (rows.length ? rows[0].remaining + Math.max(0, rows[0].payment - (rows[0].remaining * rate) / 1200) : 0);
  const purchase = (home?.purchasePrice || 0) + (home?.purchaseFees || 0);
  const downPayment = Math.max(0, purchase - principal);
  const worksDone = resale.includeWorks ? works.filter(w => w.status === 'done').reduce((s, w) => s + (w.spent || workTotals(w).net), 0) : 0;
  const purchaseDate = home?.purchaseDate || rows[0]?.date || today;
  const P0 = resale.price || home?.estimatedValue || 0;
  const fees = (resale.feesPct || 0) / 100;

  const remainingAt = month => {
    let r = principal;
    for (const row of rows) {
      if (monthKey(row.date) > month) break;
      r = row.remaining;
    }
    return r;
  };
  const paidAt = month => rows.reduce((s, row) => (monthKey(row.date) <= month ? s + row.payment : s), 0);
  const maintenanceAt = month => (resale.includeMaintenance ? maintenance.filter(x => monthKey(x.date) <= month).reduce((s, x) => s + x.cost, 0) : 0);
  const yearsFrom = (from, month) => Math.max(0, monthsBetween(from, `${month}-28`) / 12);

  // Depuis l'achat (pour dire « atteinte depuis… ») jusqu'à 2 ans après la dernière échéance.
  const nowMonth = monthKey(today);
  const startMonth = [monthKey(purchaseDate), nowMonth].sort()[0];
  const lastLoanMonth = rows.length ? monthKey(rows[rows.length - 1].date) : nowMonth;
  const span = Math.max(monthsBetweenMonths(startMonth, nowMonth) + 24, monthsBetweenMonths(startMonth, lastLoanMonth) + 24);
  const points = [];
  for (let k = 0; k <= Math.min(span, 600); k++) {
    const month = addMonthsToMonth(startMonth, k);
    const fromNow = monthsBetweenMonths(nowMonth, month);
    const crd = remainingAt(month);
    const ira = resale.ira === 'legal' && crd > 0 ? Math.min((crd * rate * 6) / 1200, crd * 0.03) : 0;
    const price = P0 * Math.pow(1 + (resale.growth || 0) / 100, fromNow / 12);
    const invested = downPayment + paidAt(month) + worksDone + maintenanceAt(month) + (resale.includeTax ? taxPerYear * yearsFrom(purchaseDate, month) : 0);
    const net = price * (1 - fees) - (resale.extraFees || 0) - crd - ira;
    const clearPrice = ((resale.extraFees || 0) + crd + ira) / (1 - fees || 1);
    const zeroPrice = ((resale.extraFees || 0) + crd + ira + invested) / (1 - fees || 1);
    points.push({ month, crd, ira, price, invested, net, gain: net - invested, clearPrice, zeroPrice, past: fromNow < 0 });
  }
  const nowIndex = points.findIndex(p => p.month === nowMonth);
  /** Seuil atteint aujourd'hui → depuis quand (sans interruption) ; sinon prochain mois où il l'est. */
  const milestone = ok => {
    if (ok(points[nowIndex])) {
      let i = nowIndex;
      while (i > 0 && ok(points[i - 1])) i--;
      return { reached: true, since: points[i] };
    }
    const next = points.slice(nowIndex).find(ok);
    return { reached: false, at: next || null };
  };
  return {
    rows,
    rate,
    principal,
    downPayment,
    worksDone,
    P0,
    points,
    future: points.slice(nowIndex),
    now: points[nowIndex],
    clear: milestone(p => p.price >= p.clearPrice),
    zero: milestone(p => p.price >= p.zeroPrice),
    source: amortization?.rows?.length ? 'import' : rows.length ? 'calcul' : 'aucun'
  };
}

function monthsBetweenMonths(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

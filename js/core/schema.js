/*
 * Schéma des données : une table plate de clés (comme Mon Garage), chacune
 * normalisée à la lecture (localStorage corrompu, tableaux convertis en
 * objets par Firebase…) et à l'écriture.
 *
 *   home         fiche de la maison (identité, achat, crédit en cours)
 *   reminders    plan d'entretien périodique (tous les N mois)
 *   maintenance  historique des interventions
 *   works        projets de travaux (postes chiffrés, TVA, aides)
 *   projects     simulations d'achat immobilier
 *   theme, style réglages d'affichage
 */

export const HEATINGS = ['Gaz', 'Fioul', 'Électrique', 'Pompe à chaleur', 'Bois / granulés', 'Autre'];
export const HOME_TYPES = ['Maison', 'Appartement'];

export const CATEGORIES = ['Chauffage', 'Plomberie', 'Électricité', 'Toiture & façade', 'Extérieur & jardin', 'Menuiseries', 'Électroménager', 'Sécurité', 'Autre'];
export const CATEGORY_ICONS = {
  Chauffage: 'flame',
  Plomberie: 'drop',
  Électricité: 'plug',
  'Toiture & façade': 'home',
  'Extérieur & jardin': 'tree',
  Menuiseries: 'window',
  Électroménager: 'sofa',
  Sécurité: 'shield',
  Autre: 'wrench'
};

/* ---------- Plan d'entretien pré-rempli ----------
 * Préconisations courantes en France (obligations légales signalées), pas un
 * diagnostic de la maison : chaque rappel reste modifiable ou supprimable. */
const R = (label, category, everyMonths, note = '') => ({ label, category, everyMonths, note });
export const COMMON_REMINDERS = [
  R('Détecteurs de fumée (test, piles)', 'Sécurité', 12, 'Obligatoire : au moins un détecteur par logement.'),
  R('Nettoyage des gouttières', 'Toiture & façade', 12, 'Idéalement à l’automne, après la chute des feuilles.'),
  R('Bouches et filtres VMC', 'Électricité', 6),
  R('Chauffe-eau (anode, détartrage)', 'Plomberie', 24),
  R('Contrôle de la toiture / démoussage', 'Toiture & façade', 36)
];
export const HEATING_REMINDERS = {
  Gaz: [R('Entretien de la chaudière', 'Chauffage', 12, 'Obligatoire chaque année (attestation à conserver).'), R('Purge des radiateurs', 'Chauffage', 12, 'Avant la saison de chauffe.')],
  Fioul: [R('Entretien de la chaudière', 'Chauffage', 12, 'Obligatoire chaque année.'), R('Ramonage du conduit', 'Chauffage', 12, 'Obligatoire (souvent 1 à 2 fois par an selon le règlement sanitaire départemental).'), R('Purge des radiateurs', 'Chauffage', 12)],
  Électrique: [R('Dépoussiérage des radiateurs', 'Chauffage', 12)],
  'Pompe à chaleur': [R('Entretien de la pompe à chaleur', 'Chauffage', 24, 'Obligatoire tous les 2 ans (4 à 70 kW).'), R('Nettoyage des filtres (unités intérieures)', 'Chauffage', 3)],
  'Bois / granulés': [R('Ramonage du conduit', 'Chauffage', 6, 'Obligatoire, généralement 2 fois par an dont une pendant la période de chauffe.'), R('Entretien du poêle / insert', 'Chauffage', 12)],
  Autre: []
};
/** Suggestions supplémentaires proposées à la saisie d'un rappel. */
export const EXTRA_SUGGESTIONS = [
  'Vidange de la fosse septique',
  'Entretien de la climatisation',
  'Entretien de l’adoucisseur',
  'Lasure / peinture des boiseries extérieures',
  'Contrôle de l’extincteur',
  'Entretien du portail motorisé',
  'Hivernage de la piscine',
  'Taille des haies',
  'Joints de salle de bain',
  'Détecteur de monoxyde de carbone'
];

export function presetReminders(heating) {
  return [...(HEATING_REMINDERS[heating] || []), ...COMMON_REMINDERS].map(r => ({ ...r, id: makeId(), lastDate: '' }));
}

/* ---------- Travaux ---------- */
export const WORK_STATUS = {
  idea: 'Idée',
  quote: 'Devis',
  planned: 'Planifié',
  ongoing: 'En cours',
  done: 'Terminé'
};
export const WORK_PRIORITY = { 1: 'Urgent', 2: 'Important', 3: 'Confort' };
export const VAT_RATES = [
  { value: 5.5, label: '5,5 % · rénovation énergétique' },
  { value: 10, label: '10 % · rénovation (logement > 2 ans)' },
  { value: 20, label: '20 % · neuf, agrandissement, achat seul' },
  { value: 0, label: 'Sans TVA · fait soi-même / déjà TTC' }
];
export const LINE_KINDS = { materials: 'Matériaux', labour: 'Main-d’œuvre', other: 'Autre' };
export const UNITS = ['u', 'm²', 'ml', 'm³', 'h', 'jour', 'forfait'];

/* ---------- Simulation d'achat ---------- */
export const PROPERTY_KINDS = { old: 'Ancien', new: 'Neuf' };
/** Frais de notaire indicatifs (droits de mutation + émoluments), en % du prix. */
export const NOTARY_RATE = { old: 8, new: 2.5 };
export const MAX_DEBT_RATIO = 35; // recommandation HCSF

export const STYLES = [
  { id: 'graphite', name: 'Graphite', hint: 'Sobre, comme Mon Garage' },
  { id: 'ardoise', name: 'Ardoise', hint: 'Bleu nuit et or' }
];

/* ---------- Normalisation ---------- */
export const asArray = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : v === null || v === undefined ? '' : String(v).slice(0, max));
const num = (v, min = 0, max = 1e9) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};
const date = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const pick = (v, allowed, fallback) => (Object.prototype.hasOwnProperty.call(allowed, v) ? v : fallback);
const list = (raw, fn) =>
  asArray(raw)
    .filter(x => x && typeof x === 'object')
    .map(fn)
    .filter(Boolean);

const normalizers = {
  home(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      name: str(raw.name, 80) || 'Ma maison',
      type: HOME_TYPES.includes(raw.type) ? raw.type : 'Maison',
      address: str(raw.address, 160),
      year: num(raw.year, 0, 2200),
      surface: num(raw.surface, 0, 100000),
      land: num(raw.land, 0, 10000000),
      rooms: num(raw.rooms, 0, 100),
      heating: HEATINGS.includes(raw.heating) ? raw.heating : 'Autre',
      dpe: /^[A-G]$/.test(raw.dpe) ? raw.dpe : '',
      purchaseDate: date(raw.purchaseDate),
      purchasePrice: num(raw.purchasePrice),
      purchaseFees: num(raw.purchaseFees),
      estimatedValue: num(raw.estimatedValue),
      loanPrincipal: num(raw.loanPrincipal),
      loanRate: num(raw.loanRate, 0, 30),
      loanMonths: num(raw.loanMonths, 0, 600),
      loanStart: date(raw.loanStart)
    };
  },
  reminders: raw =>
    list(raw, r =>
      str(r.label).trim()
        ? { id: str(r.id, 40) || makeId(), label: str(r.label, 80), category: CATEGORIES.includes(r.category) ? r.category : 'Autre', everyMonths: num(r.everyMonths, 0, 240), lastDate: date(r.lastDate), note: str(r.note, 300) }
        : null
    ),
  maintenance: raw =>
    list(raw, m =>
      date(m.date)
        ? { id: str(m.id, 40) || makeId(), label: str(m.label, 120), category: CATEGORIES.includes(m.category) ? m.category : 'Autre', date: m.date, cost: num(m.cost, 0, 1e7), provider: str(m.provider, 80), note: str(m.note, 1000) }
        : null
    ),
  works: raw =>
    list(raw, w =>
      str(w.name).trim()
        ? {
            id: str(w.id, 40) || makeId(),
            name: str(w.name, 80),
            room: str(w.room, 60),
            status: pick(w.status, WORK_STATUS, 'idea'),
            priority: [1, 2, 3].includes(Number(w.priority)) ? Number(w.priority) : 2,
            targetDate: date(w.targetDate),
            vat: VAT_RATES.some(v => v.value === Number(w.vat)) ? Number(w.vat) : 10,
            contingency: num(w.contingency, 0, 100),
            aids: num(w.aids, 0, 1e7),
            spent: num(w.spent, 0, 1e7),
            note: str(w.note, 1000),
            lines: list(w.lines, l =>
              str(l.label).trim()
                ? { id: str(l.id, 40) || makeId(), label: str(l.label, 80), kind: pick(l.kind, LINE_KINDS, 'materials'), qty: num(l.qty, 0, 1e6), unit: UNITS.includes(l.unit) ? l.unit : 'u', unitPrice: num(l.unitPrice, 0, 1e7) }
                : null
            )
          }
        : null
    ),
  projects: raw =>
    list(raw, p =>
      str(p.name).trim()
        ? {
            id: str(p.id, 40) || makeId(),
            name: str(p.name, 80),
            kind: pick(p.kind, PROPERTY_KINDS, 'old'),
            price: num(p.price),
            notaryOverride: num(p.notaryOverride),
            agencyFees: num(p.agencyFees),
            works: num(p.works),
            furniture: num(p.furniture),
            savings: num(p.savings),
            useSale: Boolean(p.useSale),
            salePrice: num(p.salePrice),
            saleFees: num(p.saleFees),
            rate: num(p.rate, 0, 20),
            years: num(p.years, 0, 40) || 25,
            insuranceRate: num(p.insuranceRate, 0, 5),
            guaranteePct: num(p.guaranteePct, 0, 10),
            fileFees: num(p.fileFees),
            income: num(p.income),
            otherLoans: num(p.otherLoans),
            propertyTax: num(p.propertyTax),
            charges: num(p.charges),
            createdAt: num(p.createdAt, 0, 1e14)
          }
        : null
    ),
  theme: v => (v === 'light' || v === 'dark' ? v : null),
  style: v => (STYLES.some(s => s.id === v) ? v : null),
};

export const DEFAULTS = { reminders: [], maintenance: [], works: [], projects: [] };

export const isKnownKey = key => Object.prototype.hasOwnProperty.call(normalizers, key);
export function normalizeKey(key, value) {
  if (!isKnownKey(key) || value === null || value === undefined) return null;
  try {
    return normalizers[key](value);
  } catch (error) {
    console.warn('[schema] donnée ignorée', key, error);
    return null;
  }
}

export const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Simulation vierge, pré-remplie avec des valeurs courantes. */
export const newProject = (name, home) => ({
  id: makeId(),
  name,
  kind: 'old',
  price: 0,
  notaryOverride: 0,
  agencyFees: 0,
  works: 0,
  furniture: 0,
  savings: 0,
  useSale: Boolean(home?.purchasePrice || home?.estimatedValue),
  salePrice: home?.estimatedValue || 0,
  saleFees: 0,
  rate: 3.3,
  years: 25,
  insuranceRate: 0.3,
  guaranteePct: 1,
  fileFees: 1000,
  income: 0,
  otherLoans: 0,
  propertyTax: 0,
  charges: 0,
  createdAt: Date.now()
});

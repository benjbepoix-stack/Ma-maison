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
 *   charges      dépenses ponctuelles (factures d'énergie, taxe foncière…)
 *   recurring    charges récurrentes (abonnements, assurance…)
 *   docs         documents (métadonnées) ; fichiers à part (js/services/files.js)
 *   inventory    inventaire des biens de valeur
 *   season       calendrier de saison (tâches cochées, tâches perso)
 *   amortization tableau d'amortissement importé
 *   resale       hypothèses de revente (opération à zéro)
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


/* ---------- Énergie & charges ---------- */
export const CHARGE_CATEGORIES = ['Électricité', 'Gaz', 'Eau', 'Fioul / bois', 'Internet & téléphone', 'Assurance habitation', 'Taxe foncière', 'Ordures ménagères', 'Copropriété', 'Jardin & piscine', 'Alarme & sécurité', 'Autre'];
export const CHARGE_ICONS = {
  Électricité: 'bolt',
  Gaz: 'flame',
  Eau: 'drop',
  'Fioul / bois': 'flame',
  'Internet & téléphone': 'phone',
  'Assurance habitation': 'shield',
  'Taxe foncière': 'building',
  'Ordures ménagères': 'trash',
  Copropriété: 'building',
  'Jardin & piscine': 'tree',
  'Alarme & sécurité': 'lock',
  Autre: 'wallet'
};
export const FREQUENCIES = { monthly: 'par mois', quarterly: 'par trimestre', yearly: 'par an' };
export const FREQ_PER_YEAR = { monthly: 12, quarterly: 4, yearly: 1 };

/* ---------- Documents ---------- */
export const DOC_TYPES = ['Acte de vente', 'Facture', 'Garantie', 'Devis', 'Diagnostic (DPE…)', 'Assurance', 'Plan', 'Notice', 'Urbanisme / permis', 'Impôts', 'Crédit', 'Autre'];
export const MAX_FILES = 10;

/* ---------- Inventaire ---------- */
export const INVENTORY_CATEGORIES = ['Électroménager', 'High-tech', 'Mobilier', 'Bijoux & montres', 'Art & décoration', 'Outillage', 'Vélos & sport', 'Instruments', 'Autre'];
export const INVENTORY_ICONS = { Électroménager: 'sofa', 'High-tech': 'plug', Mobilier: 'sofa', 'Bijoux & montres': 'star', 'Art & décoration': 'image', Outillage: 'hammer', 'Vélos & sport': 'bike', Instruments: 'sparkle', Autre: 'archive' };

/* ---------- Revente ---------- */
export const IRA_MODES = { legal: 'Indemnités légales (plafond)', none: 'Aucune (exonération)' };

export const STYLES = [
  { id: 'graphite', name: 'Graphite', hint: 'Sobre, comme Mon Garage' },
  { id: 'ardoise', name: 'Ardoise', hint: 'Bleu nuit et or' },
  { id: 'terracotta', name: 'Terracotta', hint: 'Brique et crème' },
  { id: 'sauge', name: 'Sauge', hint: 'Vert sauge et lin' },
  { id: 'chene', name: 'Chêne', hint: 'Bois clair et noyer' },
  { id: 'lagon', name: 'Lagon', hint: 'Bleu canard et corail' }
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
  charges: raw =>
    list(raw, c =>
      date(c.date)
        ? { id: str(c.id, 40) || makeId(), category: CHARGE_CATEGORIES.includes(c.category) ? c.category : 'Autre', label: str(c.label, 80), date: c.date, amount: num(c.amount, 0, 1e7), provider: str(c.provider, 80), note: str(c.note, 500) }
        : null
    ),
  recurring: raw =>
    list(raw, r =>
      num(r.amount, 0, 1e7) > 0
        ? { id: str(r.id, 40) || makeId(), category: CHARGE_CATEGORIES.includes(r.category) ? r.category : 'Autre', label: str(r.label, 80), amount: num(r.amount, 0, 1e7), frequency: pick(r.frequency, FREQUENCIES, 'monthly'), provider: str(r.provider, 80), since: date(r.since), until: date(r.until) }
        : null
    ),
  docs: raw =>
    list(raw, d =>
      str(d.title).trim() || str(d.type).trim()
        ? {
            id: str(d.id, 40) || makeId(),
            type: DOC_TYPES.includes(d.type) ? d.type : 'Autre',
            title: str(d.title, 120),
            date: date(d.date),
            expiry: date(d.expiry),
            amount: num(d.amount, 0, 1e8),
            note: str(d.note, 1000),
            files: list(d.files, f => (str(f.id).trim() ? { id: str(f.id, 40), name: str(f.name, 120), mime: str(f.mime, 60) } : null)).slice(0, MAX_FILES)
          }
        : null
    ),
  inventory: raw =>
    list(raw, i =>
      str(i.name).trim()
        ? {
            id: str(i.id, 40) || makeId(),
            name: str(i.name, 80),
            category: INVENTORY_CATEGORIES.includes(i.category) ? i.category : 'Autre',
            room: str(i.room, 60),
            brand: str(i.brand, 60),
            model: str(i.model, 60),
            serial: str(i.serial, 80),
            purchaseDate: date(i.purchaseDate),
            price: num(i.price, 0, 1e8),
            value: num(i.value, 0, 1e8),
            warrantyEnd: date(i.warrantyEnd),
            photoId: str(i.photoId, 40),
            note: str(i.note, 500)
          }
        : null
    ),
  season(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const done = {};
    Object.entries(raw.done && typeof raw.done === 'object' ? raw.done : {}).forEach(([y, ids]) => {
      if (/^\d{4}$/.test(y)) done[y] = asArray(ids).filter(x => typeof x === 'string').slice(0, 500);
    });
    return {
      done,
      custom: list(raw.custom, t => (str(t.label).trim() ? { id: str(t.id, 40) || makeId(), label: str(t.label, 80), month: Math.round(num(t.month, 1, 12)) || 1, category: CATEGORIES.includes(t.category) ? t.category : 'Autre' } : null)),
      hidden: asArray(raw.hidden).filter(x => typeof x === 'string').slice(0, 200)
    };
  },
  amortization(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const rows = asArray(raw.rows)
      .map(r => asArray(r))
      .filter(r => date(r[0]))
      .map(r => [r[0], num(r[1], 0, 1e7), num(r[2], 0, 1e9)])
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 720);
    return rows.length ? { source: str(raw.source, 120), importedAt: num(raw.importedAt, 0, 1e14), rows } : null;
  },
  resale(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      price: num(raw.price),
      feesPct: num(raw.feesPct, 0, 20),
      extraFees: num(raw.extraFees),
      growth: num(raw.growth, -20, 20),
      ira: pick(raw.ira, IRA_MODES, 'legal'),
      includeWorks: raw.includeWorks !== false,
      includeMaintenance: Boolean(raw.includeMaintenance),
      includeTax: Boolean(raw.includeTax)
    };
  },
  theme: v => (v === 'light' || v === 'dark' ? v : null),
  style: v => (STYLES.some(s => s.id === v) ? v : null),
};

export const DEFAULTS = { reminders: [], maintenance: [], works: [], projects: [], charges: [], recurring: [], docs: [], inventory: [], season: { done: {}, custom: [], hidden: [] }, resale: null, amortization: null };

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

/*
 * Estimation automatique de la valeur, à partir des ventes réelles (DVF :
 * Demandes de valeurs foncières, données publiques DGFiP / notaires).
 *
 * 1. Géocodage de l'adresse (Géoplateforme IGN, sinon Base Adresse Nationale)
 *    → code INSEE de la commune et coordonnées.
 * 2. Ventes de maisons de la commune, années récentes :
 *    a. fichiers geo-dvf d'Etalab (une vente par ligne, avec coordonnées) ;
 *    b. sinon l'API DVF open data du Cerema (sans coordonnées).
 * 3. Prix au m² = valeur foncière / surface bâtie, par vente d'une seule maison.
 *    Médiane des ventes des 24 derniers mois dans un rayon de 1 km (élargi à
 *    2 km puis à la commune s'il y a moins de 8 ventes).
 * 4. Médianes par année (toute la commune) pour l'indexation locale du prix
 *    d'achat : prix d'achat × médiane récente / médiane de l'année d'achat.
 *
 * Tout se passe dans le navigateur de l'utilisateur ; si les sources ne
 * répondent pas, l'appelant propose la saisie manuelle d'un prix au m².
 */
const GEOCODERS = [
  q => `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=1&index=address`,
  q => `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`
];
const GEO_DVF = (year, citycode) => `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/${citycode.slice(0, citycode.startsWith('97') ? 3 : 2)}/${citycode}.csv`;
const CEREMA = (citycode, fromYear) => `https://apidf-preprod.cerema.fr/dvf_opendata/mutations/?code_insee=${citycode}&anneemut_min=${fromYear}&page_size=500`;
const TIMEOUT = 20000;
const MIN_SALES = 8;

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}
async function getText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 404) return null; // année non encore publiée
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Adresse → { citycode, city, lat, lon, label }. */
export async function geocode(address) {
  let lastError = null;
  for (const url of GEOCODERS) {
    try {
      const f = (await getJSON(url(address))).features?.[0];
      if (f) return { citycode: f.properties.citycode, city: f.properties.city, label: f.properties.label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
      lastError = new Error('Adresse introuvable.');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Adresse introuvable.');
}

/* ---------- Lecture CSV (geo-dvf : virgules, guillemets possibles) ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [head, ...body] = rows;
  return body.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, k) => [h, r[k]])));
}

/** Ventes d'une seule maison, regroupées par mutation : [{ date, price, surface, lat, lon }]. */
function salesFromGeoDvf(records) {
  const byMutation = new Map();
  records.forEach(r => {
    if (!byMutation.has(r.id_mutation)) byMutation.set(r.id_mutation, []);
    byMutation.get(r.id_mutation).push(r);
  });
  const sales = [];
  byMutation.forEach(lines => {
    const first = lines[0];
    if (first.nature_mutation !== 'Vente') return;
    const houses = lines.filter(l => l.type_local === 'Maison');
    if (houses.length !== 1 || lines.some(l => l.type_local === 'Appartement' || l.type_local === 'Local industriel. commercial ou assimilé')) return;
    const price = Number(first.valeur_fonciere);
    const surface = Number(houses[0].surface_reelle_bati);
    if (!(price > 10000) || !(surface >= 25)) return;
    sales.push({ date: first.date_mutation, price, surface, lat: Number(houses[0].latitude) || null, lon: Number(houses[0].longitude) || null });
  });
  return sales;
}

async function loadGeoDvf(citycode) {
  const now = new Date().getFullYear();
  const years = [now, now - 1, now - 2, now - 3, now - 4, now - 5];
  const texts = await Promise.all(years.map(y => getText(GEO_DVF(y, citycode)).catch(error => ({ error }))));
  if (texts.every(t => t?.error)) throw texts[0].error;
  return texts.filter(t => typeof t === 'string').flatMap(t => salesFromGeoDvf(parseCSV(t)));
}

async function loadCerema(citycode) {
  const sales = [];
  let url = CEREMA(citycode, new Date().getFullYear() - 5);
  for (let page = 0; url && page < 12; page++) {
    // eslint-disable-next-line no-await-in-loop
    const data = await getJSON(url);
    (data.results || []).forEach(m => {
      const lib = String(m.libtypbien || '').toUpperCase();
      if (!/MAISON/.test(lib) || /APPART|ACTIVIT|DES MAISONS/.test(lib) || m.libnatmut !== 'Vente') return;
      const price = Number(m.valeurfonc);
      const surface = Number(m.sbati);
      if (price > 10000 && surface >= 25) sales.push({ date: m.datemut, price, surface, lat: null, lon: null });
    });
    url = data.next ? data.next.replace(/^http:/, 'https:') : null;
  }
  return sales;
}

/* ---------- Statistiques ---------- */
const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
};
function distanceM(a, b) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const m2 = s => s.price / s.surface;
/** Écarte les valeurs aberrantes (ventes partielles, terrains, erreurs de saisie). */
const clean = sales => {
  const sorted = sales.map(m2).sort((a, b) => a - b);
  const lo = Math.max(300, quantile(sorted, 0.05));
  const hi = Math.min(20000, quantile(sorted, 0.95));
  return sales.filter(s => m2(s) >= lo && m2(s) <= hi);
};

/**
 * @returns {{ source, city, citycode, radius, count, median, p25, p75, from, to, byYear: Record<string,{median,count}> }}
 */
export async function fetchValuation(address) {
  const place = await geocode(address);
  let sales;
  let source;
  try {
    sales = await loadGeoDvf(place.citycode);
    source = 'geo-dvf';
  } catch {
    sales = await loadCerema(place.citycode);
    source = 'cerema';
  }
  sales = clean(sales);
  if (!sales.length) throw new Error(`Aucune vente de maison trouvée à ${place.city}.`);

  // Médianes par année (commune entière) pour l'indexation.
  const byYear = {};
  [...new Set(sales.map(s => s.date.slice(0, 4)))].forEach(y => {
    const list = sales.filter(s => s.date.startsWith(y)).map(m2).sort((a, b) => a - b);
    if (list.length >= 5) byYear[y] = { median: Math.round(quantile(list, 0.5)), count: list.length };
  });

  // Ventes récentes (24 mois avant la plus récente), au plus près de la maison.
  const latest = sales.map(s => s.date).sort().pop();
  const limit = `${Number(latest.slice(0, 4)) - 2}${latest.slice(4)}`;
  const recent = sales.filter(s => s.date > limit);
  let radius = 0;
  let pool = recent;
  if (recent.some(s => s.lat)) {
    for (const r of [1000, 2000]) {
      const near = recent.filter(s => s.lat && distanceM(place, s) <= r);
      if (near.length >= MIN_SALES) {
        pool = near;
        radius = r;
        break;
      }
    }
  }
  const values = pool.map(m2).sort((a, b) => a - b);
  return {
    source,
    city: place.city,
    citycode: place.citycode,
    label: place.label,
    radius,
    count: values.length,
    median: Math.round(quantile(values, 0.5)),
    p25: Math.round(quantile(values, 0.25)),
    p75: Math.round(quantile(values, 0.75)),
    from: pool.map(s => s.date).sort()[0],
    to: latest,
    byYear,
    fetchedAt: Date.now()
  };
}

/*
 * Import d'un tableau d'amortissement bancaire : PDF, Excel (xlsx/xls), CSV
 * ou texte collé. Les bibliothèques (pdf.js, SheetJS) sont livrées avec
 * l'app (dossier vendor/) et chargées seulement au moment de l'import.
 *
 * Chaque ligne devient { date, nums[] } ; les colonnes « échéance » et
 * « capital restant dû » sont devinées puis modifiables avant validation.
 */
import { addMonthsToDate } from '../core/calc.js';

const MONTHS = { janv: 1, janvier: 1, fevr: 2, fev: 2, fevrier: 2, mars: 3, avr: 4, avril: 4, mai: 5, juin: 6, juil: 7, juillet: 7, aout: 8, sept: 9, septembre: 9, oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, decembre: 12 };
const pad = n => String(n).padStart(2, '0');
const deaccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- Cellules ---------- */
const DATE_PATTERNS = [
  [/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/, m => [m[3], m[2], m[1]]],
  [/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/, m => [`20${m[3]}`, m[2], m[1]]],
  [/^(\d{4})-(\d{1,2})-(\d{1,2})/, m => [m[1], m[2], m[3]]],
  [/^(\d{1,2})[/.-](\d{4})$/, m => [m[2], m[1], '1']]
];
export function parseDateCell(raw) {
  const s = String(raw).trim();
  for (const [re, fn] of DATE_PATTERNS) {
    const m = re.exec(s);
    if (!m) continue;
    const [y, mo, d] = fn(m).map(Number);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1950 && y < 2100) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  const named = /^(?:(\d{1,2})\s+)?([a-zéèûô]+)\.?\s+(\d{4})$/i.exec(s);
  if (named) {
    const mo = MONTHS[deaccent(named[2]).replace(/\.$/, '')];
    if (mo) return `${named[3]}-${pad(mo)}-${pad(Number(named[1]) || 1)}`;
  }
  return null;
}

/** « 1 234,56 € », « 1.234,56 », « 1,234.56 », « 946.80 » → nombre. */
export function parseNumberCell(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  // Des espaces ne sont admises qu'entre groupes de milliers (« 199 309,87 » oui, « 730,14 40,00 » non).
  const t = String(raw).trim().replace(/^€\s*|\s*€$/g, '');
  if (/[\s\u00a0\u202f]/.test(t) && !/^-?\d{1,3}(?:[\s\u00a0\u202f]\d{3})+(?:[.,]\d+)?$/.test(t)) return null;
  let s = String(raw).replace(/[€\s  ]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!/^-?[\d.,]+%?$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace('%', '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    const dec = lastComma > lastDot ? ',' : '.';
    s = s.replace(dec === ',' ? /\./g : /,/g, '').replace(dec, '.');
  } else if (lastComma > -1) {
    s = (s.match(/,/g).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.'));
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Découpe aux espaces en recollant les groupes de milliers (« 199 309,87 »).
 * Ambiguïté rare : un numéro d'échéance suivi d'un montant de la forme « 946,80 ».
 */
function tokenize(text) {
  const out = [];
  text
    .trim()
    .split(/[\s\u00a0\u202f]+/)
    .filter(Boolean)
    .forEach(t => {
      const prev = out[out.length - 1];
      if (prev !== undefined && /^-?\d{1,3}(?: \d{3})*$/.test(prev) && /^\d{3}(?:[,.]\d+)?$/.test(t)) out[out.length - 1] = `${prev} ${t}`;
      else out.push(t);
    });
  return out;
}

/**
 * Ligne de texte → cellules : d'abord les séparateurs francs (tabulation, « ; »,
 * 2 espaces ou plus), puis chaque morceau aux espaces simples — pdf.js
 * regroupe parfois deux colonnes voisines dans un même morceau de texte.
 * Les libellés (« Échéance », « Total »…) deviennent des cellules ignorées.
 */
function splitLine(line) {
  const parts = line.split(/\t|;| {2,}/);
  return parts.flatMap(part => {
    const cell = part.trim();
    if (parseDateCell(cell) || parseNumberCell(cell) !== null) return [cell];
    // « 05/08/2019 986,80 » ou « 730,14 40,00 » : plusieurs valeurs dans le morceau
    const tokens = tokenize(cell);
    const merged = [];
    // Dates écrites en toutes lettres (« 5 août 2019 ») : on les reconstitue.
    for (let i = 0; i < tokens.length; i++) {
      const three = tokens.slice(i, i + 3).join(' ');
      const two = tokens.slice(i, i + 2).join(' ');
      if (i + 2 < tokens.length && parseDateCell(three)) {
        merged.push(three);
        i += 2;
      } else if (i + 1 < tokens.length && parseDateCell(two) && !parseDateCell(tokens[i])) {
        merged.push(two);
        i += 1;
      } else merged.push(tokens[i]);
    }
    return merged;
  });
}

function rowFromCells(cells) {
  let date = null;
  const nums = [];
  cells.forEach(c => {
    if (c === null || c === undefined || c === '') return;
    if (c instanceof Date) {
      if (!date && !Number.isNaN(c.getTime())) date = `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`;
      return;
    }
    const d = typeof c === 'string' ? parseDateCell(c) : null;
    if (d) {
      if (!date) date = d;
      return;
    }
    const n = parseNumberCell(c);
    if (n !== null) nums.push(n);
  });
  return { date, nums };
}

export const rowsFromText = text => text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => rowFromCells(splitLine(l)));

/* ---------- Lecture des fichiers ---------- */
async function rowsFromPdf(file) {
  const pdfjs = await import(new URL('../../vendor/pdf.min.mjs', import.meta.url).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    // eslint-disable-next-line no-await-in-loop
    const content = await (await doc.getPage(p)).getTextContent();
    // Regroupe les morceaux de texte par ligne (même ordonnée), triés de gauche à droite.
    const byY = new Map();
    content.items.forEach(it => {
      if (!it.str?.trim()) return;
      const y = Math.round(it.transform[5] / 2) * 2;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ x: it.transform[4], s: it.str.trim() });
    });
    [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => lines.push(items.sort((a, b) => a.x - b.x).map(i => i.s).join('\t')));
  }
  return rowsFromText(lines.join('\n'));
}

async function rowsFromSheet(file) {
  const XLSX = await import(new URL('../../vendor/xlsx.mjs', import.meta.url).href);
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  const rows = [];
  wb.SheetNames.forEach(name => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }).forEach(cells => rows.push(rowFromCells(cells))));
  return rows;
}

export async function rowsFromFile(file) {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return rowsFromPdf(file);
  if (/\.(xlsx|xlsm|xls|ods|numbers)$/.test(name)) return rowsFromSheet(file);
  return rowsFromText(await file.text());
}

/* ---------- Détection des colonnes ---------- */
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const cv = a => {
  const m = mean(a);
  return m ? Math.sqrt(mean(a.map(v => (v - m) ** 2))) / Math.abs(m) : Infinity;
};

/**
 * Garde les lignes du tableau (nombre de colonnes le plus fréquent) et devine
 * les colonnes. @returns {{ rows, columns, guess:{payment, remaining}, hasDates }}
 */
export function analyze(rawRows) {
  const counts = new Map();
  rawRows.filter(r => r.nums.length >= 2).forEach(r => counts.set(r.nums.length, (counts.get(r.nums.length) || 0) + 1));
  const width = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
  if (!width) return { rows: [], columns: [], guess: { payment: -1, remaining: -1 }, hasDates: false };
  const rows = rawRows.filter(r => r.nums.length === width);
  const columns = Array.from({ length: width }, (_, k) => rows.map(r => r.nums[k]));
  const isIndex = col => col.every((v, i) => Number.isInteger(v) && (i === 0 || v === col[i - 1] + 1));
  const decreasing = col => col.filter((v, i) => i === 0 || v <= col[i - 1] + 0.01).length >= col.length * 0.9 && col[0] > col[col.length - 1];
  const candidates = columns.map((col, k) => ({ k, col, m: mean(col) })).filter(c => !isIndex(c.col) && c.m > 0);
  const remaining = candidates.filter(c => decreasing(c.col)).sort((a, b) => b.m - a.m)[0]?.k ?? -1;
  const payment =
    candidates
      .filter(c => c.k !== remaining && cv(c.col.slice(0, -1)) < 0.08)
      .sort((a, b) => b.m - a.m)
      .find(c => remaining === -1 || c.m < mean(columns[remaining]))?.k ?? -1;
  return { rows, columns, guess: { payment, remaining }, hasDates: rows.filter(r => r.date).length >= rows.length * 0.8 };
}

/** Lignes finales [[date, échéance, capital restant dû]] ; dates manquantes déduites de la 1re échéance. */
export function buildRows(analysis, { payment, remaining, firstDate }) {
  return analysis.rows
    .map((r, i) => [analysis.hasDates && r.date ? r.date : firstDate ? addMonthsToDate(firstDate, i) : null, r.nums[payment] || 0, Math.max(0, r.nums[remaining] || 0)])
    .filter(r => r[0]);
}

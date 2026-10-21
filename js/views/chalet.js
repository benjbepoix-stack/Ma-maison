/*
 * Accueil « vivant » : le chalet dessiné, avec une pastille posée sur chaque équipement
 * qui demande quelque chose (rouge = en retard, or = bientôt), et le fil de l'année
 * (les prochaines échéances sur douze mois, comme la route de Mon Garage).
 * Un appui sur une pastille ou un panneau ouvre « Noter l'intervention ».
 */
import { $, esc } from '../core/utils.js';
import { todayKey } from '../core/dates.js';
import { icon } from '../ui/icons.js';

/* Où se trouve chaque catégorie d'entretien sur le dessin (viewBox 340 × 230). */
const SPOTS = {
  Chauffage: [231, 46],
  'Toiture & façade': [112, 98],
  Sécurité: [212, 106],
  Autre: [170, 138],
  Menuiseries: [127, 170],
  Électroménager: [148, 188],
  Électricité: [232, 188],
  Plomberie: [269, 189],
  'Extérieur & jardin': [42, 150]
};

const ART = `<svg viewBox="0 0 340 230" role="img" aria-label="Dessin du chalet, une pastille sur chaque équipement à entretenir">
  <defs><linearGradient id="chaletSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky-1)"/><stop offset="1" stop-color="var(--sky-2)"/></linearGradient></defs>
  <rect class="sky" width="340" height="230"/>
  <rect class="wood" x="39" y="160" width="6" height="42" rx="2"/><circle class="leaf" cx="42" cy="146" r="22"/><circle class="leaf" cx="56" cy="164" r="13"/>
  <g class="smoke" id="chaletSmoke"><circle cx="231" cy="40" r="6"/><circle cx="231" cy="40" r="6"/><circle cx="231" cy="40" r="6"/></g>
  <rect class="roof" x="222" y="44" width="18" height="44" rx="2"/>
  <rect class="ground" x="0" y="200" width="340" height="30"/>
  <rect class="wall" x="100" y="110" width="140" height="92"/>
  <path class="wall" d="M106 118 170 62l64 56z"/>
  <path class="roof" d="M56 136 170 32l114 104-14 8L170 54 70 144z"/>
  <rect class="win" x="158" y="80" width="24" height="24" rx="3"/><path class="frame" d="M170 80v24M158 92h24"/>
  <path class="rail" d="M92 128h156M100 128v18M112 128v18M124 128v18M136 128v18M148 128v18M160 128v18M172 128v18M184 128v18M196 128v18M208 128v18M220 128v18M232 128v18M240 128v18"/>
  <rect class="wood" x="90" y="145" width="160" height="6" rx="2"/>
  <rect class="win" x="116" y="160" width="22" height="24" rx="3"/><path class="frame" d="M127 160v24M116 172h22"/>
  <rect class="win" x="202" y="160" width="22" height="24" rx="3"/><path class="frame" d="M213 160v24M202 172h22"/>
  <rect class="roof" x="158" y="160" width="24" height="42" rx="4"/><circle cx="176" cy="182" r="1.8" fill="var(--win)"/>
  <rect class="wall" x="252" y="176" width="34" height="26" rx="3"/><path class="frame" d="M259 186h18M259 193h12"/>
</svg>`;

/** Pastilles : une par catégorie qui a un entretien en retard ou bientôt (la plus urgente donne la couleur). */
function pins(reminders) {
  const groups = new Map();
  reminders
    .filter(r => r.status.level === 'late' || r.status.level === 'soon')
    .forEach(r => {
      const key = SPOTS[r.category] ? r.category : 'Autre';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
  return [...groups].map(([category, list]) => {
    list.sort((a, b) => (a.status.days ?? 0) - (b.status.days ?? 0));
    const level = list.some(r => r.status.level === 'late') ? 'late' : 'soon';
    const [x, y] = SPOTS[category];
    const label = list.map(r => r.label).join(', ');
    // Un seul entretien : la saisie s'ouvre directement ; plusieurs : la liste des rappels.
    const action = list.length === 1 ? `data-note="${esc(list[0].id)}"` : 'data-goto="maintenance/plan"';
    return `<button type="button" class="pin" data-level="${level}" style="left:${((x / 340) * 100).toFixed(2)}%;top:${((y / 230) * 100).toFixed(2)}%" ${action} aria-label="${esc(`${category} : ${label}, ${level === 'late' ? 'en retard' : 'bientôt'}`)}"><i></i>${list.length > 1 ? `<b>${list.length}</b>` : ''}</button>`;
  });
}

export function renderChalet(reminders) {
  const late = reminders.filter(r => r.status.level === 'late').length;
  const soon = reminders.filter(r => r.status.level === 'soon').length;
  const todo = late + soon;
  const el = $('#chalet');
  if (!el.querySelector('svg')) el.innerHTML = `<div class="chalet__art">${ART}<div id="chaletPins"></div></div><div class="chalet__foot"><div class="chalet__count" id="chaletCount"></div><div class="chalet__legend" id="chaletLegend" aria-hidden="true"></div></div><button type="button" class="icon-btn icon-btn--sm chalet__edit" data-open="house" aria-label="Modifier la fiche de la maison">${icon('edit', 17)}</button>`;
  $('#chaletPins').innerHTML = pins(reminders).join('');
  // Le chauffage est à jour : la cheminée fume.
  $('#chaletSmoke').classList.toggle('is-on', !reminders.some(r => r.category === 'Chauffage' && r.status.level === 'late'));
  $('#chaletCount').innerHTML = todo ? `${todo} chose${todo > 1 ? 's' : ''} à faire<span>Touchez une pastille</span>` : reminders.length ? 'Tout est à jour<span>Rien à faire pour le moment</span>' : 'Aucun rappel<span>Ajoutez-en dans l’onglet Rappels</span>';
  $('#chaletLegend').innerHTML = [late && `<span><i style="--c:var(--late)"></i>${late} en retard</span>`, soon && `<span><i style="--c:var(--soon)"></i>${soon} bientôt</span>`].filter(Boolean).join('');
}

/* ---------- Fil de l'année ---------- */
const dayNum = key => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 864e5;
};
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function renderYear(reminders) {
  const today = todayKey();
  const [ty, tm] = today.split('-').map(Number);
  const W = 78;
  const startKey = `${ty}-${String(tm).padStart(2, '0')}-01`;
  const start = dayNum(startKey);
  const px = key => ((dayNum(key) - start) / 30.44) * W + 24;
  const end = start + 366;
  const signs = reminders
    .filter(r => r.status.nextDate && (r.status.level === 'late' || dayNum(r.status.nextDate) < end))
    .sort((a, b) => a.status.nextDate.localeCompare(b.status.nextDate));
  $('#yearSection').hidden = !signs.length;
  if (!signs.length) return;
  let html = '<div class="year__road"></div>';
  for (let m = 0; m < 12; m++) {
    const month = ((tm - 1 + m) % 12) + 1;
    const year = ty + Math.floor((tm - 1 + m) / 12);
    const key = `${year}-${String(month).padStart(2, '0')}-01`;
    html += `<div class="year__month" style="left:${px(key) + W / 2}px">${MONTHS[month - 1]}${month === 1 ? ` ${String(year).slice(2)}` : ''}</div>`;
  }
  // Panneaux rangés en étages pour ne jamais se chevaucher.
  const floors = [];
  let top = 0;
  signs.forEach(r => {
    const x = Math.max(44, Math.min(12 * W, px(r.status.level === 'late' ? today : r.status.nextDate)));
    const w = r.label.length * 7 + 24;
    let f = 0;
    while (floors[f] !== undefined && floors[f] > x - w / 2 - 6) f++;
    floors[f] = x + w / 2;
    top = Math.max(top, f);
    const action = r.status.level === 'ok' ? `data-reminder-open="${esc(r.id)}"` : `data-note="${esc(r.id)}"`;
    html += `<div class="year__sign" data-level="${r.status.level}" style="left:${x}px;bottom:44px;--stem:${10 + f * 34}px"><button type="button" ${action}>${esc(r.label)}</button></div>`;
  });
  const lane = $('#yearLane');
  const height = 120 + top * 34;
  lane.style.width = `${12 * W + 48}px`;
  lane.style.height = `${height}px`;
  lane.innerHTML = `${html}<div class="year__now" style="left:${px(today)}px;height:${height - 40}px"></div>`;
}

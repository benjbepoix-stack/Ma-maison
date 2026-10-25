/*
 * Accueil « vivant » : le chalet dessiné, avec une pastille posée sur chaque équipement
 * qui demande quelque chose (rouge = en retard, or = bientôt).
 * Un appui sur une pastille ouvre « Noter l'intervention ».
 */
import { $, esc } from '../core/utils.js';
import { seasonOf, seasonCount } from './season.js';
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
  <g class="deco deco--sun"><circle cx="292" cy="44" r="16"/></g>
  <rect class="wood" x="39" y="160" width="6" height="42" rx="2"/><circle class="leaf" cx="42" cy="146" r="22"/><circle class="leaf leaf--2" cx="56" cy="164" r="13"/><circle class="leaf leaf--3" cx="28" cy="160" r="10"/>
  <g class="deco deco--fall"><path d="M80 40c4 0 6 3 6 6-4 0-6-3-6-6z"/><path d="M300 30c4 0 6 3 6 6-4 0-6-3-6-6z"/><path d="M150 10c4 0 6 3 6 6-4 0-6-3-6-6z"/></g>
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
  <g class="deco deco--snow"><path d="M56 136 170 32l114 104-6 4L170 44 62 140z"/><rect x="0" y="198" width="340" height="6" rx="3"/><circle cx="42" cy="126" r="8"/><circle cx="30" cy="140" r="5"/></g>
  <g class="deco deco--flowers"><circle cx="20" cy="206" r="3"/><circle cx="74" cy="210" r="3"/><circle cx="268" cy="208" r="3"/><circle cx="300" cy="212" r="3"/><circle cx="320" cy="205" r="3"/></g>
  <g class="deco deco--leaves"><path d="M14 206c6-3 10 2 16 0M262 212c6-3 10 2 16 0M300 206c6-3 10 2 16 0"/></g>
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
  if (!el.querySelector('svg')) el.innerHTML = `<div class="chalet__art">${ART}<div id="chaletPins"></div></div><div class="chalet__foot"><div class="chalet__count" id="chaletCount"></div><div class="chalet__legend" id="chaletLegend" aria-hidden="true"></div></div><button type="button" class="chalet__season" id="chaletSeason" data-goto="maintenance/saison"></button><button type="button" class="icon-btn icon-btn--sm chalet__edit" data-open="house" aria-label="Modifier la fiche de la maison">${icon('edit', 17)}</button>`;
  $('#chaletPins').innerHTML = pins(reminders).join('');
  // Le chauffage est à jour : la cheminée fume.
  $('#chaletSmoke').classList.toggle('is-on', !reminders.some(r => r.category === 'Chauffage' && r.status.level === 'late'));
  $('#chaletCount').innerHTML = todo ? `${todo} chose${todo > 1 ? 's' : ''} à faire<span>Touchez une pastille</span>` : reminders.length ? 'Tout est à jour<span>Rien à faire pour le moment</span>' : 'Aucun rappel<span>Ajoutez-en dans l’onglet Rappels</span>';
  // Le chalet change de tenue avec la saison ; la ligne du bas mène aux tâches de saison.
  const season = seasonOf(Number(todayKey().slice(5, 7)));
  const c = seasonCount(season);
  el.dataset.season = season.id;
  $('#chaletSeason').innerHTML = `<span class="chalet__chip" data-season="${season.id}">${esc(season.name)}</span><span>${c.total ? `${c.done} tâche${c.done > 1 ? 's' : ''} de saison sur ${c.total} faite${c.done > 1 ? 's' : ''}` : 'Aucune tâche de saison'}</span>${icon('chevronRight', 18)}`;
  $('#chaletLegend').innerHTML = [late && `<span><i style="--c:var(--late)"></i>${late} en retard</span>`, soon && `<span><i style="--c:var(--soon)"></i>${soon} bientôt</span>`].filter(Boolean).join('');
}

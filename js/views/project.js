/*
 * Projet immobilier : simulations d'achat (plusieurs scénarios comparables).
 * Les champs se recalculent en direct ; l'enregistrement suit la saisie
 * (léger différé) pour ne pas écrire dans le cloud à chaque touche.
 */
import { $, $$, esc, sameJSON } from '../core/utils.js';
import * as store from '../core/store.js';
import { readText, write } from '../services/storage.js';
import { simulate, amortizationByYear } from '../core/calc.js';
import { PROPERTY_KINDS, NOTARY_RATE, MAX_DEBT_RATIO, newProject, makeId } from '../core/schema.js';
import { promptDialog, confirmDialog } from '../ui/dialog.js';
import { renderBarChart, PALETTE } from '../ui/charts.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { euro, euroRound, euroShort, toNumber, numInput, pct } from './common.js';

const SELECTED_KEY = 'maison_project_selected';
const SAVE_DELAY = 500;

let selectedId = readText(SELECTED_KEY, '') || null;
let draft = null; // scénario en cours d'édition (en avance sur le store pendant la saisie)
let bound = null; // id du scénario dont le formulaire est affiché
let saveTimer = null;

const field = (name, label, { suffix = '€', placeholder = '', help = '' } = {}) => `
  <div class="field"><label class="field__label" for="pj-${name}">${esc(label)}${suffix ? ` · ${esc(suffix)}` : ''}</label>
  <input class="input" id="pj-${name}" data-p="${name}" inputmode="decimal" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(numInput(draft[name]))}">
  ${help ? `<p class="field__help" id="pj-${name}-help">${help}</p>` : ''}</div>`;

const fact = (label, value, cls = '') => `<div class="fact ${cls}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;

/* ---------- Formulaire ---------- */
function renderForm() {
  const p = draft;
  $('#projectBody').innerHTML = `
    <section class="card cost-hero" id="pjHero"></section>
    <div class="stack pj-warnings" id="pjWarnings"></div>

    <section class="section">
      <header class="section__head"><h2 class="section__title"><span class="section__icon section__icon--blue">${icon('building', 18)}</span>Le bien</h2></header>
      <div class="card form">
        <div class="field"><label class="field__label" for="pj-name">Nom de la simulation</label><input class="input" id="pj-name" data-p="name" data-text maxlength="80" value="${esc(p.name)}" autocomplete="off"></div>
        <div class="segmented segmented--types" role="radiogroup" aria-label="Type de bien">
          ${Object.entries(PROPERTY_KINDS).map(([k, v]) => `<label><input type="radio" name="pjKind" data-p="kind" value="${k}" ${p.kind === k ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}
        </div>
        <div class="form-grid">
          ${field('price', 'Prix du bien', { placeholder: 'Ex. 320 000' })}
          ${field('agencyFees', 'Frais d’agence', { placeholder: '0' })}
          ${field('works', 'Travaux', { placeholder: '0' })}
          ${field('furniture', 'Mobilier, équipement', { placeholder: '0' })}
        </div>
        ${field('notaryOverride', 'Frais de notaire', { placeholder: '', help: '' })}
      </div>
    </section>

    <section class="section">
      <header class="section__head"><h2 class="section__title"><span class="section__icon section__icon--mint">${icon('piggy', 18)}</span>Apport</h2></header>
      <div class="card form">
        ${field('savings', 'Épargne apportée', { placeholder: '0' })}
        <label class="check"><input type="checkbox" data-p="useSale" ${p.useSale ? 'checked' : ''}><span>Vendre ma maison actuelle</span></label>
        <div class="form-grid" id="pjSale" ${p.useSale ? '' : 'hidden'}>
          ${field('salePrice', 'Prix de vente', { placeholder: 'Ex. 250 000' })}
          ${field('saleFees', 'Frais de vente', { placeholder: 'Agence, diagnostics' })}
        </div>
        <p class="pj-sale" id="pjSaleInfo" ${p.useSale ? '' : 'hidden'}></p>
      </div>
    </section>

    <section class="section">
      <header class="section__head"><h2 class="section__title"><span class="section__icon section__icon--violet">${icon('percent', 18)}</span>Crédit</h2></header>
      <div class="card form">
        <div class="form-grid">
          ${field('rate', 'Taux nominal', { suffix: '%', placeholder: 'Ex. 3,3' })}
          ${field('years', 'Durée', { suffix: 'ans', placeholder: '25' })}
          ${field('insuranceRate', 'Assurance emprunteur', { suffix: '%/an', placeholder: 'Ex. 0,30' })}
          ${field('guaranteePct', 'Garantie (caution)', { suffix: '%', placeholder: 'Ex. 1' })}
        </div>
        ${field('fileFees', 'Frais de dossier', { placeholder: 'Ex. 1 000' })}
      </div>
    </section>

    <section class="section">
      <header class="section__head"><h2 class="section__title"><span class="section__icon section__icon--amber">${icon('wallet', 18)}</span>Revenus &amp; charges</h2></header>
      <div class="card form">
        <div class="form-grid">
          ${field('income', 'Revenus nets du foyer', { suffix: '€/mois', placeholder: 'Ex. 5 000' })}
          ${field('otherLoans', 'Autres crédits', { suffix: '€/mois', placeholder: '0' })}
          ${field('propertyTax', 'Taxe foncière', { suffix: '€/an', placeholder: 'Ex. 1 400' })}
          ${field('charges', 'Énergie, copro…', { suffix: '€/mois', placeholder: 'Ex. 180' })}
        </div>
      </div>
    </section>

    <section class="section">
      <header class="section__head"><h2 class="section__title">Détail du plan de financement</h2></header>
      <dl class="card card--list facts" id="pjFacts"></dl>
    </section>

    <section class="card section">
      <header class="card__head"><div><h2 class="card__title">Remboursement par année</h2><p class="card__sub" id="pjChartSub"></p></div></header>
      <div id="pjChart"></div>
    </section>

    <section class="section" id="pjCompare"></section>

    <div class="pj-actions section">
      <button type="button" class="btn btn--soft" data-pj="duplicate">${icon('repeat', 18)}<span>Dupliquer</span></button>
      <button type="button" class="btn btn--ghost btn--danger-text" data-pj="delete">${icon('trash', 18)}<span>Supprimer</span></button>
    </div>
    <p class="footnote">Estimation indicative : frais de notaire ≈ ${pct(NOTARY_RATE.old, 1)} dans l’ancien et ${pct(NOTARY_RATE.new, 1)} dans le neuf, endettement maximal recommandé ${MAX_DEBT_RATIO} % (HCSF). L’offre de prêt de la banque fait foi.</p>`;
}

/* ---------- Résultats (recalculés à chaque saisie) ---------- */
function renderResults() {
  const p = draft;
  const s = simulate(p, store.home());
  const ratio = s.debtRatio;
  const ratioLevel = ratio === null ? '' : ratio > MAX_DEBT_RATIO ? 'is-late' : ratio > MAX_DEBT_RATIO - 3 ? 'is-soon' : 'is-ok';
  $('#pjHero').innerHTML = `
    <div class="cost-hero__label">Mensualité</div>
    <div class="cost-hero__value">${esc(euroRound(s.monthly))}<small> / mois</small></div>
    <p class="cost-hero__note">${s.principal ? esc(`${euroRound(s.monthlyLoan)} de crédit + ${euroRound(s.monthlyInsurance)} d’assurance · ${p.years} ans à ${pct(p.rate, 2)}`) : 'Aucun emprunt nécessaire'}</p>
    <div class="kpis">
      <div class="kpi"><span>Coût total</span><strong>${esc(euroShort(s.total))}</strong></div>
      <div class="kpi"><span>Emprunt</span><strong>${esc(euroShort(s.principal))}</strong></div>
      <div class="kpi kpi--${ratioLevel}"><span>Endettement</span><strong>${ratio === null ? '—' : esc(pct(ratio))}</strong></div>
    </div>
    ${ratio !== null ? `<div class="debt-gauge ${ratioLevel}" style="--value:${Math.min(100, (ratio / 50) * 100)}%; --limit:${(MAX_DEBT_RATIO / 50) * 100}%"><span></span><i title="${MAX_DEBT_RATIO} %"></i></div>` : ''}`;

  // Alertes
  const warnings = [];
  if (ratio !== null && ratio > MAX_DEBT_RATIO) warnings.push(['late', `Endettement de ${pct(ratio)} : au-delà des ${MAX_DEBT_RATIO} % recommandés, la banque risque de refuser. Mensualité maximale : ${euroRound(s.maxMonthly)}.`]);
  if (p.years > (p.kind === 'new' ? 27 : 25)) warnings.push(['soon', `Durée de ${p.years} ans : les banques plafonnent en général à ${p.kind === 'new' ? 27 : 25} ans.`]);
  const fees = s.notary + s.guarantee + p.fileFees;
  if (s.principal && s.contribution < fees) warnings.push(['soon', `Apport inférieur aux frais (notaire, garantie, dossier : ${euroRound(fees)}) : les banques demandent souvent de les couvrir.`]);
  if (s.excess) warnings.push(['ok', `L’apport couvre tout le projet : aucun crédit nécessaire (${euroRound(s.excess)} d’excédent).`]);
  if (!p.income && s.principal) warnings.push(['info', 'Renseignez les revenus du foyer pour calculer le taux d’endettement et la capacité d’emprunt.']);
  $('#pjWarnings').innerHTML = warnings.map(([lvl, text]) => `<p class="pj-warning is-${lvl}">${icon(lvl === 'ok' ? 'check' : lvl === 'info' ? 'info' : 'alert', 18)}<span>${esc(text)}</span></p>`).join('');

  // Notaire : estimation affichée en indication
  const notaryInput = $('#pj-notaryOverride');
  if (notaryInput) notaryInput.placeholder = `Estimé : ${euroRound(s.notaryAuto)}`;
  const notaryHelp = $('#pj-notaryOverride-help');
  if (notaryHelp) notaryHelp.textContent = `Laissez vide pour l’estimation (${pct(NOTARY_RATE[p.kind], 1)} du prix, ${PROPERTY_KINDS[p.kind].toLowerCase()}).`;

  // Vente de la maison actuelle
  const sale = $('#pjSaleInfo');
  if (sale) {
    sale.hidden = !p.useSale;
    sale.innerHTML = s.loan
      ? `Capital restant dû aujourd’hui : <b>${esc(euroRound(s.saleRemaining))}</b> → apport net de la vente : <b>${esc(euroRound(s.saleNet))}</b>`
      : `Apport net de la vente : <b>${esc(euroRound(s.saleNet))}</b>. Renseignez le crédit en cours dans la fiche de la maison pour déduire le capital restant dû.`;
  }

  // Détail
  $('#pjFacts').innerHTML = [
    fact('Prix du bien', euro(p.price)),
    fact(`Frais de notaire${p.notaryOverride ? '' : ' (estimés)'}`, euro(s.notary)),
    p.agencyFees ? fact('Frais d’agence', euro(p.agencyFees)) : '',
    p.works ? fact('Travaux', euro(p.works)) : '',
    p.furniture ? fact('Mobilier, équipement', euro(p.furniture)) : '',
    s.guarantee ? fact(`Garantie (${pct(p.guaranteePct, 2)} de l’emprunt)`, euro(s.guarantee)) : '',
    p.fileFees ? fact('Frais de dossier', euro(p.fileFees)) : '',
    fact('Coût total de l’opération', euro(s.total), 'fact--total'),
    fact(`Apport (${pct(s.contributionPct, 0)})`, `− ${euro(s.contribution)}`, 'fact--minus'),
    fact('Montant emprunté', euro(s.principal), 'fact--total'),
    s.principal ? fact('Intérêts', euro(s.interest)) : '',
    s.principal ? fact('Assurance emprunteur', euro(s.insurance)) : '',
    s.principal ? fact('Coût total du crédit', euro(s.creditCost), 'fact--total') : '',
    p.income ? fact(`Capacité d’emprunt max (${MAX_DEBT_RATIO} %)`, euro(s.capacity)) : '',
    s.principal ? fact('Revenus nécessaires', `${euroRound(s.requiredIncome)} / mois`) : '',
    fact('Budget logement mensuel', `${euroRound(s.housingMonthly)} / mois`),
    s.restToLive !== null ? fact('Reste à vivre', `${euroRound(s.restToLive)} / mois`, s.restToLive < 0 ? 'fact--danger' : '') : ''
  ].join('');

  // Graphique : capital / intérêts / assurance par année
  const rows = s.principal ? amortizationByYear(s.principal, p.rate, s.months, p.insuranceRate) : [];
  $('#pjChartSub').textContent = rows.length ? `${euroRound(s.principal)} sur ${p.years} ans · touchez une barre pour le détail` : '';
  if (rows.length) {
    renderBarChart(
      $('#pjChart'),
      rows.map(r => ({ key: String(r.year), label: String(r.year), title: `Année ${r.year} · reste ${euroRound(r.remaining)}`, values: { principal: r.principal, interest: r.interest, insurance: r.insurance } })),
      {
        bars: [
          { key: 'principal', label: 'Capital', color: PALETTE[0] },
          { key: 'interest', label: 'Intérêts', color: PALETTE[1] },
          { key: 'insurance', label: 'Assurance', color: PALETTE[3] }
        ],
        stacked: true,
        fmt: euroRound,
        axisFmt: euroShort
      }
    );
  } else {
    $('#pjChart').innerHTML = '<p class="chart-empty">Pas d’emprunt sur ce scénario.</p>';
  }

  renderCompare();
}

/** Tableau comparatif dès qu'il existe au moins deux scénarios. */
function renderCompare() {
  const projects = store.get('projects').map(x => (x.id === draft.id ? draft : x));
  const host = $('#pjCompare');
  if (projects.length < 2) {
    host.innerHTML = '';
    return;
  }
  const home = store.home();
  const rows = projects.map(x => ({ p: x, s: simulate(x, home) }));
  const best = Math.min(...rows.map(r => r.s.monthly));
  host.innerHTML = `
    <header class="section__head"><h2 class="section__title">Comparatif</h2></header>
    <div class="card card--list compare">
      <div class="compare__row compare__row--head"><span>Scénario</span><span>Total</span><span>Mensualité</span><span>Endett.</span></div>
      ${rows
        .map(
          ({ p, s }) => `<button type="button" class="compare__row ${p.id === draft.id ? 'is-current' : ''}" data-scenario="${esc(p.id)}">
        <span class="compare__name">${esc(p.name)}</span><span>${esc(euroShort(s.total))}</span><span class="${s.monthly === best ? 'is-best' : ''}">${esc(euroRound(s.monthly))}</span><span class="${s.debtRatio > MAX_DEBT_RATIO ? 'is-bad' : ''}">${s.debtRatio === null ? '—' : esc(pct(s.debtRatio, 0))}</span></button>`
        )
        .join('')}
    </div>`;
}

/* ---------- Rendu de l'onglet ---------- */
function renderBar(projects) {
  $('#scenarioBar').innerHTML = `${projects
    .map(p => `<button type="button" class="scenario-chip" data-scenario="${esc(p.id)}" aria-pressed="${p.id === selectedId}">${esc(p.name)}</button>`)
    .join('')}<button type="button" class="scenario-chip scenario-chip--add" data-pj="new">${icon('plus', 16)}<span>Simulation</span></button>`;
}

export function renderProject() {
  const projects = store.get('projects');
  if (!projects.some(p => p.id === selectedId)) selectedId = projects[0]?.id || null;
  renderBar(projects);
  const stored = projects.find(p => p.id === selectedId);
  if (!stored) {
    bound = null;
    draft = null;
    $('#projectBody').innerHTML = `<div class="empty-hero card">
      <span class="empty-hero__icon">${icon('key', 28)}</span>
      <h2>Simuler un achat immobilier</h2>
      <p>Prix, frais de notaire, apport (dont la revente de votre maison), crédit et assurance : mensualité, coût total et taux d’endettement en direct. Créez plusieurs scénarios pour les comparer.</p>
      <button type="button" class="btn btn--primary btn--lg" data-pj="new">${icon('plus', 18)}<span>Nouvelle simulation</span></button>
    </div>`;
    return;
  }
  // Le formulaire n'est reconstruit qu'en changeant de scénario ou si une
  // modification arrive d'un autre appareil (pas pendant la saisie).
  const typing = bound === selectedId && $('#projectBody').contains(document.activeElement);
  if (bound !== selectedId || (!saveTimer && !typing && !sameJSON(draft, stored))) {
    draft = stored;
    bound = selectedId;
    renderForm();
  } else if (!saveTimer) {
    draft = stored; // valeurs normalisées (bornes) sans perdre le champ en cours
  }
  renderResults();
}

function select(id) {
  flushSave();
  selectedId = id;
  write(SELECTED_KEY, id || '');
  renderProject();
}

/* ---------- Enregistrement ---------- */
function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (draft) store.upsert('projects', draft);
}
const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DELAY);
};

function onInput(e) {
  const el = e.target.closest('[data-p]');
  if (!el || !draft) return;
  const key = el.dataset.p;
  if (el.type === 'checkbox') draft[key] = el.checked;
  else if (el.type === 'radio') draft[key] = el.value;
  else if ('text' in el.dataset) draft[key] = el.value.trim() ? el.value.slice(0, 80) : 'Sans nom';
  else draft[key] = Math.max(0, toNumber(el.value) || 0);
  if (key === 'useSale') $('#pjSale').hidden = !el.checked;
  if (key === 'name') {
    const chip = $(`#scenarioBar [data-scenario="${CSS.escape(draft.id)}"]`);
    if (chip) chip.textContent = draft.name || 'Sans nom';
  }
  renderResults();
  scheduleSave();
}

async function createScenario(copyOf = null) {
  const count = store.get('projects').length;
  const name = await promptDialog({ title: copyOf ? 'Dupliquer la simulation' : 'Nouvelle simulation', label: 'Nom', value: copyOf ? `${copyOf.name} (copie)` : `Projet ${count + 1}`, placeholder: 'Ex. Maison à Pouilley', confirmLabel: 'Créer' });
  if (!name) return;
  flushSave();
  const item = copyOf ? { ...copyOf, id: makeId(), name, createdAt: Date.now() } : newProject(name, store.home());
  store.upsert('projects', item);
  select(item.id);
  toast(copyOf ? 'Simulation dupliquée' : 'Simulation créée');
}

async function deleteScenario() {
  if (!draft || !(await confirmDialog({ title: `Supprimer « ${draft.name} » ?`, confirmLabel: 'Supprimer', danger: true }))) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  store.remove('projects', draft.id);
  toast('Simulation supprimée');
}

export function initProject() {
  const view = $('#projectView');
  view.addEventListener('input', onInput);
  view.addEventListener('change', e => e.target.matches('[type="radio"], [type="checkbox"]') && onInput(e));
  // Champ quitté : mise en forme propre de la saisie (« 320000 » → « 320000 », vide si 0).
  view.addEventListener('focusout', e => {
    const el = e.target.closest('input[data-p]:not([data-text]):not([type="checkbox"]):not([type="radio"])');
    if (el && draft) el.value = numInput(draft[el.dataset.p]);
  });
  view.addEventListener('click', e => {
    const chip = e.target.closest('[data-scenario]');
    if (chip) return select(chip.dataset.scenario);
    const action = e.target.closest('[data-pj]')?.dataset.pj;
    if (action === 'new') createScenario();
    else if (action === 'duplicate' && draft) createScenario(draft);
    else if (action === 'delete') deleteScenario();
  });
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushSave());
}

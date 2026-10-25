/* Point d'entrée : connexion, navigation par onglets, synchronisation. */
import { $, $$, debounce } from './core/utils.js';
import * as store from './core/store.js';
import { reminderAlerts } from './core/calc.js';
import { rules, validate } from './core/validation.js';
import { readText, write } from './services/storage.js';
import { initFirebase, pushCloud, flushNow, clearPending, signIn, signUp, resetPassword, signOutUser, describeAuthError, currentUser, isConfigured } from './services/firebase.js';
import { initDialogs, confirmDialog, openSheet, closeSheet } from './ui/dialog.js';
import { applyTheme, renderThemeSwitch } from './ui/theme.js';
import { renderStatus } from './ui/status.js';
import { toast, toastError } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { initOverduePrompt, checkOverdue } from './features/overdue-prompt.js';
import { renderHome } from './views/home.js';
import { initHouse, openHouse } from './views/house.js';
import { initMaintenance, renderMaintenance, openMaintenance, openReminder } from './views/maintenance.js';
import { initWorks, renderWorks, openWork, openLine, showWork, currentWork } from './views/works.js';
import { initProject, renderProject } from './views/project.js';
import { initSeason, renderSeason, openSeasonTask, monthTasks } from './views/season.js';
import { initCharges, renderCharges, openCharge, openRecurring } from './views/charges.js';
import { initResale, renderResale } from './views/resale.js';
import { initDocs, renderDocs, openDoc, expiryLevel } from './views/docs.js';
import { initInventory, renderInventory, openItem } from './views/inventory.js';
import { retryPendingFiles } from './services/files.js';
import { scheduleMaisonSync, enableMaisonSync, resetMaisonSync } from './services/carnet-sync.js';
import { scheduleBudgetSync, enableBudgetSync, resetBudgetSync } from './services/budget-sync.js';
import { setBadge } from './services/badge.js';
import { MONTH_NAMES } from './core/season-tasks.js';
import { sectionOn, setSection, resetSections } from './core/sections.js';

const LAST_UID = 'maison_last_uid';
const THEME_MIGRATED = 'maison_theme_auto';
/*
 * Pages : #/<page>/<sous-onglet> (#/travaux/<id> pour un projet). Barre du bas : Rappels
 * (entretien), Maison (accueil) et Coûts (finances) ; Travaux et Dossier s'ouvrent depuis
 * l'onglet Maison (« Dans la maison ») et gardent cet onglet allumé.
 */
const VIEWS = {
  home: { slug: '', title: 'Maison', render: renderHome },
  maintenance: { slug: 'entretien', title: 'Rappels', subs: { plan: ['Échéances', renderMaintenance], saison: ['Saisons', renderSeason] } },
  works: { slug: 'travaux', title: 'Travaux', render: renderWorks },
  finances: { slug: 'finances', title: 'Coûts', subs: { charges: ['Charges', renderCharges], credit: ['Crédit & revente', renderResale], projet: ['Projet d’achat', renderProject] } },
  dossier: { slug: 'dossier', title: 'Dossier', subs: { documents: ['Documents', renderDocs], inventaire: ['Inventaire', renderInventory] } }
};
let view = 'home';
const subs = { maintenance: 'plan', finances: 'charges', dossier: 'documents' };
/* Rubriques facultatives (Réglages › Rubriques) : onglet ou sous-onglet → clé de `sections`. */
const OPTIONAL = { works: 'works', 'finances/projet': 'projects', 'dossier/inventaire': 'inventory' };
/** Onglet de la barre du bas allumé pour chaque page. */
const TAB_OF = { works: 'home', dossier: 'home' };
const viewShown = name => !OPTIONAL[name] || sectionOn(OPTIONAL[name]);
const subShown = (name, sub) => !OPTIONAL[`${name}/${sub}`] || sectionOn(OPTIONAL[`${name}/${sub}`]);

/* ---------- Navigation ---------- */
function route() {
  const [, slug = '', part = ''] = /^#\/([^/]*)\/?([^/]*)/.exec(location.hash) || [];
  let next = Object.keys(VIEWS).find(k => VIEWS[k].slug === slug && slug) || 'home';
  let sub = VIEWS[next].subs ? (VIEWS[next].subs[part] ? part : Object.keys(VIEWS[next].subs)[0]) : null;
  // Rubrique masquée : retour à l'onglet parent (Accueil pour Travaux), sans entrée d'historique.
  if (!viewShown(next)) {
    [next, sub] = ['home', null];
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  } else if (sub && !subShown(next, sub)) {
    sub = Object.keys(VIEWS[next].subs)[0];
    history.replaceState(history.state, '', `#/${VIEWS[next].slug}`);
  }
  showWork(next === 'works' && part ? decodeURIComponent(part) : null);
  const changed = next !== view || (sub && sub !== subs[next]);
  view = next;
  if (sub) subs[next] = sub;
  render();
  if (changed || (next === 'works' && part)) window.scrollTo({ top: 0 });
}

/** go('finances'), go('finances/credit') */
function go(target) {
  const [name, sub] = target.split('/');
  const v = VIEWS[name];
  const hash = v.slug ? `#/${v.slug}${sub || (v.subs && subs[name] !== Object.keys(v.subs)[0]) ? `/${sub || subs[name]}` : ''}` : '';
  if (location.hash === hash || (!hash && !location.hash)) route();
  else location.hash = hash;
}

function openWorkDetail(id) {
  if (id) location.hash = `#/travaux/${encodeURIComponent(id)}`;
  else if (/^#\/travaux\//.test(location.hash) && history.length > 1) history.back();
  else location.hash = '#/travaux';
}

/* ---------- Rendu ---------- */
/** Rubriques facultatives : onglet Travaux, sous-onglets Achat et Inventaire, interrupteurs des réglages. */
function renderSections() {
  $$('.tabbar__item').forEach(b => (b.hidden = !viewShown(b.dataset.view)));
  Object.keys(VIEWS)
    .filter(name => VIEWS[name].subs)
    .forEach(name => {
      const tabs = $$(`#${name}View .subtabs [data-sub]`);
      tabs.forEach(b => (b.hidden = !subShown(name, b.dataset.sub)));
      // Un seul sous-onglet restant : contrôle segmenté inutile.
      $(`#${name}View .subtabs`).hidden = tabs.filter(b => !b.hidden).length < 2;
    });
  $$('#sectionSwitch [data-section]').forEach(input => (input.checked = sectionOn(input.dataset.section)));
}

function render() {
  const w = view === 'works' ? currentWork() : null;
  renderSections();
  $$('[data-view-panel]').forEach(el => (el.hidden = el.dataset.viewPanel !== view));
  $$('.tabbar__item').forEach(b => {
    const on = b.dataset.view === (TAB_OF[view] || view);
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#backBtn').hidden = !w && !TAB_OF[view];
  document.body.classList.toggle('is-detail', Boolean(w));
  const v = VIEWS[view];
  const sub = v.subs ? subs[view] : null;
  if (v.subs) {
    $$(`#${view}View [data-sub]`).forEach(b => b.setAttribute('aria-selected', String(b.dataset.sub === sub)));
    $$(`#${view}View [data-subpanel]`).forEach(p => (p.hidden = p.dataset.subpanel !== sub));
  }
  // Comme Mon Garage : le titre est celui de l'onglet, les sous-onglets se lisent en dessous.
  const title = w ? w.name : v.title;
  const homeName = store.home()?.name || 'Ma Maison';
  $('#topKicker').textContent = w ? 'Travaux' : 'Ma Maison';
  $('#topTitle').textContent = view === 'home' ? homeName : title;
  document.title = view === 'home' ? 'Ma Maison' : `${sub ? v.subs[sub][0] : title} · Ma Maison`;
  const [fab, fabLabel] = fabAction(sub);
  $('#fabBtn').hidden = !fab;
  if (fab) {
    $('#fabBtn').dataset.open = fab;
    $('#fabBtn').setAttribute('aria-label', fabLabel);
  }
  const reminders = reminderAlerts(store.get('reminders'));
  $('#maintenanceDot').hidden = !reminders.some(r => r.status.level === 'late');
  $('#dossierDot').hidden = !store.get('docs').some(d => expiryLevel(d)?.level === 'soon');
  (sub ? v.subs[sub][1] : v.render)();
  setBadge(reminders.filter(r => r.status.level === 'late').length);
  publishDigest(reminders);
  scheduleBudgetSync(store.get('maintenance'));
}

/** Bouton + de l'en-tête (comme Mon Garage) : l'ajout le plus courant de la page. */
function fabAction(sub) {
  if (view === 'works') return currentWork() ? ['line', 'Ajouter un poste'] : ['work', 'Nouveau projet de travaux'];
  if (view === 'home') return store.home() ? ['maintenance', 'Noter une intervention'] : ['house', 'Créer la fiche de la maison'];
  const key = sub ? `${view}/${sub}` : view;
  return {
    'maintenance/plan': ['maintenance', 'Noter une intervention'],
    'maintenance/saison': ['seasonTask', 'Ajouter une tâche de saison'],
    'finances/charges': ['charge', 'Ajouter une facture'],
    'dossier/documents': ['doc', 'Ajouter un document'],
    'dossier/inventaire': ['item', 'Ajouter un objet']
  }[key] || [];
}

/* ---------- Résumé pour Carnet ---------- */
/**
 * Publie vers Carnet (lecture seule) : entretiens en retard ou à moins de 30 jours et
 * garanties qui expirent, avec leur date (`due`) pour son calendrier, et les tâches du
 * calendrier de saison du mois restant à faire (`season`). Aucune donnée financière.
 */
function publishDigest(reminders) {
  const home = store.home();
  if (!home) return;
  const alerts = reminders
    .filter(r => r.status.level === 'late' || r.status.level === 'soon')
    .slice(0, 8)
    .map(r => ({ level: r.status.level, title: r.label, text: r.status.level === 'late' ? `En retard de ${-r.status.days} j` : `Dans ${r.status.days} j`, ...(r.status.nextDate ? { due: r.status.nextDate } : {}) }));
  store
    .get('docs')
    .map(d => ({ d, e: expiryLevel(d) }))
    .filter(x => x.e && x.e.level === 'soon' && x.e.days <= 30)
    .slice(0, 3)
    .forEach(({ d, e }) => alerts.push({ level: 'soon', title: d.title, text: `${d.type === 'Garantie' ? 'Garantie' : 'Échéance'} dans ${e.days} j`, due: d.expiry }));
  const month = Number(new Date().getMonth() + 1);
  const season = monthTasks(month)
    .filter(t => !t.done)
    .slice(0, 12)
    .map(t => ({ id: t.id, label: t.label, category: t.category }));
  scheduleMaisonSync({ name: home.name, updatedAt: Date.now(), alerts, season, seasonMonth: MONTH_NAMES[month - 1] });
}

/** Données du compte chargées (cloud reçu) : liaisons avec Carnet et Mon Budget autorisées (rien sans compte). */
function enableLinks() {
  enableBudgetSync();
  enableMaisonSync();
}

/** Changement de compte : liaisons coupées jusqu'au chargement des données du nouveau compte. */
function resetLinks() {
  resetBudgetSync();
  resetMaisonSync();
}

/* ---------- Thème ---------- */
/**
 * Thème « Auto » : l'ancien défaut « Sombre » enregistré devient « Auto », une seule fois
 * (sur l'appareil au lancement, puis à la première réception des données du compte).
 * Un choix fait dans les réglages arrête la migration.
 */
function migrateTheme(stage) {
  const done = readText(THEME_MIGRATED, '');
  if (done === 'cloud' || (stage === 'local' && done)) return;
  if (store.get('theme') === 'dark') store.set('theme', 'auto');
  write(THEME_MIGRATED, stage);
}

/* ---------- Connexion ---------- */
let authMode = 'login';

function showAuth(state) {
  document.documentElement.classList.add('is-auth-pending');
  $('#authScreen').hidden = false;
  $('#authLoading').hidden = state !== 'loading';
  $('#authForm').hidden = state !== 'form';
  $('#authOffline').hidden = state !== 'offline';
}

function hideAuth() {
  document.documentElement.classList.remove('is-auth-pending');
  $('#authScreen').hidden = true;
}

function renderAuthMode() {
  const texts = {
    login: ['Connexion', 'Même compte que Mon Garage, Carnet, Allure et Mon budget.', 'Se connecter', 'Créer un compte'],
    signup: ['Créer mon compte', 'Un compte pour synchroniser votre maison entre vos appareils.', 'Créer le compte', 'J’ai déjà un compte'],
    reset: ['Mot de passe oublié', 'Indiquez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.', 'Envoyer le lien', 'Retour à la connexion']
  }[authMode];
  [$('#authTitle').textContent, $('#authSub').textContent, $('#authSubmit').textContent, $('#authSwitch').textContent] = texts;
  $('#authPasswordField').hidden = authMode === 'reset';
  $('#authForgot').hidden = authMode !== 'login';
  $('#authPassword').autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
  $('#authError').textContent = '';
  $('#authError').classList.remove('is-success');
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const err = $('#authError');
  const { valid, errors } = validate(
    { email, password },
    {
      email: [rules.required('L’e-mail'), v => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Adresse e-mail invalide.')],
      password: authMode === 'reset' ? [] : [rules.required('Le mot de passe'), v => (v.length >= 6 ? null : '6 caractères minimum.')]
    }
  );
  if (!valid) {
    err.textContent = Object.values(errors)[0];
    return;
  }
  const btn = $('#authSubmit');
  btn.classList.add('is-loading');
  btn.disabled = true;
  err.textContent = '';
  try {
    if (authMode === 'login') await signIn(email, password);
    else if (authMode === 'signup') await signUp(email, password);
    else {
      await resetPassword(email);
      err.classList.add('is-success');
      err.textContent = 'E-mail envoyé. Pensez à vérifier vos courriers indésirables.';
    }
  } catch (error) {
    console.error('[auth]', error);
    err.classList.remove('is-success');
    err.textContent = describeAuthError(error);
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

function onUser(user) {
  if (user) {
    // Autre compte que le précédent sur cet appareil : on repart d'une base vide.
    const last = readText(LAST_UID, '');
    if (last && last !== user.uid) {
      clearPending();
      resetLinks();
      resetSections();
      store.resetLocal();
    }
    write(LAST_UID, user.uid);
    setTimeout(retryPendingFiles, 3000);
    $('#accountLine').textContent = `Connecté : ${user.email}`;
    $('#logoutBtn').hidden = false;
    hideAuth();
    route();
  } else {
    authMode = 'login';
    renderAuthMode();
    showAuth('form');
  }
}

function initAuthUI() {
  $('#authForm').addEventListener('submit', onAuthSubmit);
  $('#authSwitch').addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    renderAuthMode();
  });
  $('#authForgot').addEventListener('click', () => {
    authMode = 'reset';
    renderAuthMode();
  });
  $('#authRetry').addEventListener('click', () => location.reload());
  $('#authLocal').addEventListener('click', () => {
    hideAuth();
    $('#accountLine').textContent = 'Mode hors ligne : données de cet appareil uniquement.';
    toast('Mode hors ligne', { type: 'info' });
    checkOverdue();
  });
  $('#logoutBtn').addEventListener('click', async () => {
    if (!currentUser()) return;
    if (!(await confirmDialog({ title: 'Se déconnecter ?', message: 'Vos données restent enregistrées dans votre compte.', confirmLabel: 'Se déconnecter' }))) return;
    try {
      await signOutUser();
    } catch {
      toastError('Déconnexion impossible. Réessayez.');
    }
  });
}

/* ---------- Actions ---------- */
const OPENERS = {
  house: () => {
    closeSheet('settingsSheet');
    openHouse();
  },
  reminder: () => openReminder(),
  maintenance: () => openMaintenance(),
  work: () => openWork(),
  line: () => openLine(),
  seasonTask: () => openSeasonTask(),
  charge: () => openCharge(),
  recurring: () => openRecurring(),
  doc: () => openDoc(),
  item: () => openItem()
};

function onClick(e) {
  const tab = e.target.closest('.tabbar__item[data-view]');
  if (tab) return go(tab.dataset.view);
  const subtab = e.target.closest('.subtabs [data-sub]');
  if (subtab) return go(`${view}/${subtab.dataset.sub}`);
  const goto = e.target.closest('[data-goto]');
  if (goto) return go(goto.dataset.goto);
  const work = e.target.closest('[data-work-open]');
  if (work) return openWorkDetail(work.dataset.workOpen);
  // Pastille du chalet : « Noter l'intervention » de ce rappel.
  const note = e.target.closest('[data-note]');
  if (note) return openMaintenance(null, { reminderId: note.dataset.note });
  const reminder = e.target.closest('[data-reminder-open]');
  if (reminder) return openReminder(reminder.dataset.reminderOpen);
  const open = e.target.closest('[data-open]');
  if (open && OPENERS[open.dataset.open]) OPENERS[open.dataset.open]();
}

function initGlobalErrors() {
  let last = 0;
  const report = error => {
    console.error(error);
    if (Date.now() - last < 4000) return;
    last = Date.now();
    toastError('Une erreur inattendue est survenue. Vos données sont conservées.');
  };
  window.addEventListener('error', e => report(e.error || e.message));
  window.addEventListener('unhandledrejection', e => report(e.reason));
}

async function init() {
  initGlobalErrors();
  store.loadLocal();
  migrateTheme('local');
  applyTheme(store.theme(), store.style());
  renderThemeSwitch(store.theme());
  $$('[data-icon]').forEach(el => (el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22)));

  initDialogs();
  initHouse();
  initMaintenance();
  initWorks({ onNavigate: openWorkDetail });
  initProject();
  initSeason();
  initCharges();
  initResale();
  initDocs();
  initInventory();
  initOverduePrompt({
    onView: reminderId => {
      go('maintenance/plan');
      openMaintenance(null, { reminderId });
    }
  });
  initAuthUI();

  store.subscribe((keys, source) => {
    if (keys.includes('theme') || keys.includes('style')) {
      applyTheme(store.theme(), store.style(), { animate: true });
      renderThemeSwitch(store.theme());
    }
    // Rubriques modifiées (ou autre compte) : la page affichée peut être masquée.
    if (keys.includes('sections') || source === 'reset') route();
    else render();
  });
  document.addEventListener('click', onClick);
  window.addEventListener('hashchange', route);
  $('#backBtn').addEventListener('click', () => (view === 'works' && currentWork() ? openWorkDetail(null) : go('home')));
  $('#settingsBtn').addEventListener('click', () => openSheet('settingsSheet'));
  $('#themeSwitch').addEventListener('change', e => {
    const val = e.target.closest('input[name="theme"]')?.value;
    if (!val) return;
    write(THEME_MIGRATED, 'cloud'); // choix explicite : plus de migration
    if (val !== store.theme()) store.setKeys({ theme: val });
  });
  $('#sectionSwitch').addEventListener('change', e => {
    const input = e.target.closest('input[data-section]');
    if (input) setSection(input.dataset.section, input.checked);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
    else render();
  });
  window.addEventListener('pagehide', flushNow);
  // Seule la largeur compte pour les graphiques : la barre d'adresse qui se replie (hauteur)
  // ne doit pas redessiner la page, ni interrompre un rappel en train d'être glissé.
  let width = window.innerWidth;
  window.addEventListener(
    'resize',
    debounce(() => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      render();
    }, 200)
  );

  route();

  // Mises à jour : voir sw.js. Un nouveau service worker recharge la page une fois.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(error => console.warn('[sw] enregistrement impossible', error));
  }

  if (!isConfigured()) {
    hideAuth();
    renderStatus('local', 'Données enregistrées sur cet appareil');
    $('#accountLine').textContent = 'Données enregistrées sur cet appareil.';
    checkOverdue();
    enableLinks();
    return;
  }
  showAuth('loading');
  store.setCloudSink(pushCloud);
  const ok = await initFirebase({
    onUser,
    onRemote: remote => {
      store.applyRemote(remote);
      migrateTheme('cloud');
      checkOverdue();
      enableLinks();
    },
    // Premier instantané reçu (même vide : les données de l'appareil deviennent celles du compte).
    // Lecture refusée (loaded = false) : données du compte non chargées, liaisons coupées.
    onReady: loaded => {
      checkOverdue();
      if (loaded) enableLinks();
    },
    onStatus: renderStatus,
    onError: message => toastError(`Synchronisation : ${message}`),
    onAck: store.acknowledge,
    getSnapshot: store.cloudSnapshot
  });
  if (!ok) showAuth('offline');
}

init();

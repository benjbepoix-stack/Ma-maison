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
import { initValuation } from './views/valuation.js';
import { retryPendingFiles } from './services/files.js';
import { scheduleMaisonSync } from './services/carnet-sync.js';
import { MONTH_NAMES } from './core/season-tasks.js';

const LAST_UID = 'maison_last_uid';
/* Onglets et sous-onglets : #/<onglet>/<sous-onglet> (#/travaux/<id> pour un projet). */
const VIEWS = {
  home: { slug: '', title: 'Accueil', render: renderHome },
  maintenance: { slug: 'entretien', title: 'Entretien', subs: { plan: ['Entretien', renderMaintenance], saison: ['Calendrier de saison', renderSeason] } },
  works: { slug: 'travaux', title: 'Travaux', render: renderWorks },
  finances: { slug: 'finances', title: 'Finances', subs: { charges: ['Énergie & charges', renderCharges], credit: ['Crédit & revente', renderResale], projet: ['Projet d’achat', renderProject] } },
  dossier: { slug: 'dossier', title: 'Dossier', subs: { documents: ['Documents', renderDocs], inventaire: ['Inventaire', renderInventory] } }
};
let view = 'home';
const subs = { maintenance: 'plan', finances: 'charges', dossier: 'documents' };

/* ---------- Navigation ---------- */
function route() {
  const [, slug = '', part = ''] = /^#\/([^/]*)\/?([^/]*)/.exec(location.hash) || [];
  const next = Object.keys(VIEWS).find(k => VIEWS[k].slug === slug && slug) || 'home';
  const sub = VIEWS[next].subs ? (VIEWS[next].subs[part] ? part : Object.keys(VIEWS[next].subs)[0]) : null;
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
function render() {
  const w = view === 'works' ? currentWork() : null;
  $$('[data-view-panel]').forEach(el => (el.hidden = el.dataset.viewPanel !== view));
  $$('.tabbar__item').forEach(b => {
    const on = b.dataset.view === view;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#backBtn').hidden = !w;
  document.body.classList.toggle('is-detail', Boolean(w));
  const v = VIEWS[view];
  const sub = v.subs ? subs[view] : null;
  if (v.subs) {
    $$(`#${view}View [data-sub]`).forEach(b => b.setAttribute('aria-selected', String(b.dataset.sub === sub)));
    $$(`#${view}View [data-subpanel]`).forEach(p => (p.hidden = p.dataset.subpanel !== sub));
  }
  const title = w ? w.name : sub ? v.subs[sub][0] : v.title;
  const homeName = store.home()?.name || 'Ma Maison';
  $('#topKicker').textContent = w ? 'Travaux' : view === 'home' ? 'Ma Maison' : homeName;
  $('#topTitle').textContent = view === 'home' ? homeName : title;
  document.title = view === 'home' ? 'Ma Maison' : `${title} · Ma Maison`;
  const reminders = reminderAlerts(store.get('reminders'));
  $('#maintenanceDot').hidden = !reminders.some(r => r.status.level === 'late');
  $('#dossierDot').hidden = !store.get('docs').some(d => expiryLevel(d)?.level === 'soon');
  (sub ? v.subs[sub][1] : v.render)();
  publishDigest(reminders);
}

/* ---------- Widget « Maison » de Carnet ---------- */
function publishDigest(reminders) {
  const home = store.home();
  if (!home) return;
  const alerts = reminders
    .filter(r => r.status.level === 'late' || r.status.level === 'soon')
    .slice(0, 3)
    .map(r => ({ level: r.status.level, title: r.label, text: r.status.level === 'late' ? `En retard de ${-r.status.days} j` : `Dans ${r.status.days} j` }));
  store
    .get('docs')
    .map(d => ({ d, e: expiryLevel(d) }))
    .filter(x => x.e && x.e.level === 'soon')
    .slice(0, 2)
    .forEach(({ d, e }) => alerts.push({ level: 'soon', title: d.title, text: `${d.type === 'Garantie' ? 'Garantie' : 'Échéance'} dans ${e.days} j` }));
  const month = Number(new Date().getMonth() + 1);
  const left = monthTasks(month).filter(t => !t.done).length;
  if (left) alerts.push({ level: 'info', title: `Saison · ${MONTH_NAMES[month - 1]}`, text: `${left} tâche${left > 1 ? 's' : ''} du mois à faire` });
  scheduleMaisonSync({ name: home.name, updatedAt: Date.now(), alerts });
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
    login: ['Connexion', 'Même compte que Mon Garage.', 'Se connecter', 'Créer un compte'],
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
  initValuation();
  initOverduePrompt({
    onView: reminderId => {
      go('maintenance/plan');
      openMaintenance(null, { reminderId });
    }
  });
  initAuthUI();

  store.subscribe(keys => {
    if (keys.includes('theme') || keys.includes('style')) {
      applyTheme(store.theme(), store.style(), { animate: true });
          renderThemeSwitch(store.theme());
    }
    render();
  });
  document.addEventListener('click', onClick);
  window.addEventListener('hashchange', route);
  $('#backBtn').addEventListener('click', () => openWorkDetail(null));
  $('#settingsBtn').addEventListener('click', () => openSheet('settingsSheet'));
  $('#themeSwitch').addEventListener('change', e => {
    const val = e.target.closest('input[name="theme"]')?.value;
    if (val && val !== store.theme()) store.setKeys({ theme: val });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
    else render();
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('resize', debounce(render, 200));

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
    return;
  }
  showAuth('loading');
  store.setCloudSink(pushCloud);
  const ok = await initFirebase({
    onUser,
    onRemote: remote => {
      store.applyRemote(remote);
      checkOverdue();
    },
    onStatus: renderStatus,
    onError: message => toastError(`Synchronisation : ${message}`),
    onAck: store.acknowledge,
    getSnapshot: store.cloudSnapshot
  });
  if (!ok) showAuth('offline');
}

init();

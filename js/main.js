/* Point d'entrée : connexion, navigation par onglets, synchronisation. */
import { $, $$, debounce } from './core/utils.js';
import * as store from './core/store.js';
import { STYLES } from './core/schema.js';
import { reminderAlerts } from './core/calc.js';
import { rules, validate } from './core/validation.js';
import { readText, write } from './services/storage.js';
import { initFirebase, pushCloud, flushNow, clearPending, signIn, signUp, resetPassword, signOutUser, describeAuthError, currentUser, isConfigured } from './services/firebase.js';
import { initDialogs, confirmDialog, openSheet, closeSheet } from './ui/dialog.js';
import { applyTheme, renderStylePicker, renderThemeSwitch } from './ui/theme.js';
import { renderStatus } from './ui/status.js';
import { toast, toastError } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { initOverduePrompt, checkOverdue } from './features/overdue-prompt.js';
import { renderHome } from './views/home.js';
import { initHouse, openHouse } from './views/house.js';
import { initMaintenance, renderMaintenance, openMaintenance, openReminder } from './views/maintenance.js';
import { initWorks, renderWorks, openWork, openLine, showWork, currentWork } from './views/works.js';
import { initProject, renderProject } from './views/project.js';

const LAST_UID = 'maison_last_uid';
const VIEWS = {
  home: { hash: '', title: 'Accueil', render: renderHome },
  maintenance: { hash: '#/entretien', title: 'Entretien', render: renderMaintenance },
  works: { hash: '#/travaux', title: 'Travaux', render: renderWorks },
  project: { hash: '#/projet', title: 'Projet immobilier', render: renderProject }
};
let view = 'home';

/* ---------- Navigation (#/entretien, #/travaux/<id>, #/projet) ---------- */
function route() {
  const hash = location.hash;
  const work = /^#\/travaux\/([^/]+)/.exec(hash);
  const next = Object.keys(VIEWS).find(k => VIEWS[k].hash && hash.startsWith(VIEWS[k].hash)) || 'home';
  showWork(work ? decodeURIComponent(work[1]) : null);
  const changed = next !== view;
  view = next;
  render();
  if (changed || work) window.scrollTo({ top: 0 });
}

function go(name) {
  const target = VIEWS[name].hash;
  if (location.hash === target || (!target && !location.hash)) route();
  else location.hash = target;
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
  const homeName = store.home()?.name || 'Ma Maison';
  $('#topKicker').textContent = w ? 'Travaux' : view === 'home' ? 'Ma Maison' : homeName;
  $('#topTitle').textContent = w ? w.name : view === 'home' ? homeName : VIEWS[view].title;
  document.title = view === 'home' ? 'Ma Maison' : `${w ? w.name : VIEWS[view].title} · Ma Maison`;
  const late = reminderAlerts(store.get('reminders')).some(r => r.status.level === 'late');
  $('#maintenanceDot').hidden = !late;
  VIEWS[view].render();
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
  line: () => openLine()
};

function onClick(e) {
  const tab = e.target.closest('.tabbar__item[data-view]');
  if (tab) return go(tab.dataset.view);
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
  renderStylePicker(STYLES, store.style());
  renderThemeSwitch(store.theme());
  $$('[data-icon]').forEach(el => (el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22)));

  initDialogs();
  initHouse();
  initMaintenance();
  initWorks({ onNavigate: openWorkDetail });
  initProject();
  initOverduePrompt({
    onView: reminderId => {
      go('maintenance');
      openMaintenance(null, { reminderId });
    }
  });
  initAuthUI();

  store.subscribe(keys => {
    if (keys.includes('theme') || keys.includes('style')) {
      applyTheme(store.theme(), store.style(), { animate: true });
      renderStylePicker(STYLES, store.style());
      renderThemeSwitch(store.theme());
    }
    render();
  });
  document.addEventListener('click', onClick);
  window.addEventListener('hashchange', route);
  $('#backBtn').addEventListener('click', () => openWorkDetail(null));
  $('#settingsBtn').addEventListener('click', () => openSheet('settingsSheet'));
  $('#stylePicker').addEventListener('click', e => {
    const pick = e.target.closest('[data-style-pick]')?.dataset.stylePick;
    if (pick && pick !== store.style()) store.setKeys({ style: pick });
  });
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

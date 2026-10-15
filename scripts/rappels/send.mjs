/*
 * Rappels du matin de Ma Maison (lancé chaque jour par .github/workflows/rappels.yml).
 *
 * Pour chaque compte abonné (users/<uid>/maison_push/devices), lit le résumé
 * publié par l'app (users/<uid>/maison_push/digest : titres et dates) et envoie
 * une notification par Firebase Cloud Messaging quand :
 *   - un entretien tombe dans 7 jours, aujourd'hui, ou passe en retard (hier) ;
 *   - le lundi : rappel des entretiens toujours en retard ;
 *   - une garantie ou une échéance tombe dans 30 jours, 7 jours ou aujourd'hui.
 * Rien à dire : aucune notification. La pastille de l'icône reçoit le nombre
 * d'entretiens en retard.
 *
 * Gratuit : GitHub Actions + FCM (offre Spark, sans Cloud Functions).
 * Secret requis : FIREBASE_SERVICE_ACCOUNT (JSON du compte de service Firebase).
 * DRY_RUN=1 : calcule et affiche les volumes sans rien envoyer.
 * Les journaux n'affichent jamais de titre ni d'identifiant de compte.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';

const DB_URL = 'https://test-e27e9-default-rtdb.europe-west1.firebasedatabase.app';
const TZ = 'Europe/Paris';
const APP_URL = './#/entretien';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

/* ---------- Dates (jour civil à Paris) ---------- */
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const dayNumber = key => {
  const [y, m, d] = String(key).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const isMonday = key => new Date(dayNumber(key) * 86400000).getUTCDay() === 1;

/* ---------- Ce qu'il faut dire aujourd'hui ---------- */
export function buildMessage(items, today) {
  const t = dayNumber(today);
  const lines = [];
  let late = 0;
  for (const item of Array.isArray(items) ? items : Object.values(items || {})) {
    if (!item?.due || !/^\d{4}-\d{2}-\d{2}$/.test(item.due)) continue;
    const days = dayNumber(item.due) - t;
    const title = String(item.title || 'Entretien').slice(0, 80);
    if (item.kind === 'entretien') {
      if (days < 0) late++;
      if (days === 7) lines.push({ rank: 2, text: `${title} : dans 7 jours` });
      else if (days === 0) lines.push({ rank: 1, text: `${title} : aujourd’hui` });
      else if (days === -1 || (days < -1 && isMonday(today))) lines.push({ rank: 0, text: `${title} : en retard de ${-days} j` });
    } else if (days === 30 || days === 7 || days === 0) {
      const what = item.kind === 'garantie' ? 'Garantie' : 'Échéance';
      lines.push({ rank: 3, text: `${what} ${title} : ${days ? `dans ${days} jours` : 'aujourd’hui'}` });
    }
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.rank - b.rank);
  const title = lines.length === 1 ? 'Ma Maison' : `Ma Maison · ${lines.length} rappels`;
  const body = lines.slice(0, 4).map(l => l.text).join('\n') + (lines.length > 4 ? `\net ${lines.length - 4} de plus` : '');
  return { title, body, badge: late };
}

/* ---------- Lecture des comptes ---------- */
async function listUids(app) {
  // Liste « shallow » (clés seulement) : ne télécharge pas les données des autres apps.
  const { access_token } = await app.options.credential.getAccessToken();
  const res = await fetch(`${DB_URL}/users.json?shallow=true`, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!res.ok) throw new Error(`Lecture des comptes impossible (HTTP ${res.status})`);
  return Object.keys((await res.json()) || {});
}

const INVALID_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Secret FIREBASE_SERVICE_ACCOUNT manquant (voir README, « Rappels »).');
  const app = initializeApp({ credential: cert(JSON.parse(raw)), databaseURL: DB_URL });
  const db = getDatabase(app);
  const messaging = getMessaging(app);
  const today = todayKey();
  const stats = { accounts: 0, subscribed: 0, messages: 0, sent: 0, removed: 0, failed: 0 };

  for (const uid of await listUids(app)) {
    stats.accounts++;
    const node = (await db.ref(`users/${uid}/maison_push`).get()).val();
    const devices = Object.entries(node?.devices || {}).filter(([, d]) => d?.token);
    if (!devices.length) continue;
    stats.subscribed++;
    const msg = buildMessage(node.digest?.items, today);
    if (!msg) continue;
    stats.messages++;
    if (DRY_RUN) continue;
    for (const [id, device] of devices) {
      try {
        await messaging.send({
          token: device.token,
          data: { title: msg.title, body: msg.body, badge: String(msg.badge), url: APP_URL, tag: `ma-maison-${today}` },
          webpush: { headers: { Urgency: 'normal', TTL: String(12 * 3600) } }
        });
        stats.sent++;
      } catch (error) {
        if (INVALID_TOKEN.has(error?.code)) {
          await db.ref(`users/${uid}/maison_push/devices/${id}`).remove();
          stats.removed++;
        } else {
          stats.failed++;
          console.warn('Envoi échoué :', error?.code || error?.message);
        }
      }
    }
  }
  console.log(`${today}${DRY_RUN ? ' (essai, rien envoyé)' : ''} :`, JSON.stringify(stats));
  if (stats.failed && !stats.sent) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error?.message || error);
    process.exit(1);
  });
}

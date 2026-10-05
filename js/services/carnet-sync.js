/*
 * Widget « Maison » de Carnet (Mon tableau de bord) : Ma Maison publie en
 * arrière-plan un court résumé de ce qui est à faire (entretiens en retard ou
 * proches, garanties qui expirent, tâches de saison du mois) vers
 * app/maison_alerts de la base partagée de Carnet. Carnet le lit en direct,
 * sans jamais écrire. Même principe, best-effort, que le widget Garage :
 * une erreur (hors ligne, règles pas encore publiées) est ignorée et
 * retentée au prochain changement. Aucune donnée financière n'est envoyée.
 */
const DB_URL = 'https://dashboard---projet-default-rtdb.europe-west1.firebasedatabase.app';

let lastSent = null;
let timer = null;
let pending = null;

/** digest = { name, updatedAt, alerts: [{ level: 'late'|'soon'|'info', title, text }] } */
export function scheduleMaisonSync(digest) {
  pending = digest;
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

async function flush() {
  const digest = pending;
  pending = null;
  if (!digest) return;
  // updatedAt exclu de la comparaison : on n'envoie que si le contenu change.
  const key = JSON.stringify({ ...digest, updatedAt: 0 });
  if (key === lastSent) return;
  try {
    const res = await fetch(`${DB_URL}/app/maison_alerts.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(digest)
    });
    if (res.ok) lastSent = key;
  } catch {
    /* best-effort */
  }
}

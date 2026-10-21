/* Pastille sur l'icône de l'app installée : nombre d'entretiens en retard (API Badging). */
export function setBadge(count) {
  try {
    if (count > 0) navigator.setAppBadge?.(count)?.catch?.(() => {});
    else navigator.clearAppBadge?.()?.catch?.(() => {});
  } catch {
    /* non pris en charge */
  }
}

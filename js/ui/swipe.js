/*
 * « Glisser vers la droite quand c'est fait » (comme dans Mon Garage) : la ligne suit
 * le doigt, un geste lancé assez loin valide, sinon elle revient en place. Un appui
 * simple garde son effet habituel (le clic n'est bloqué qu'après un vrai glissé).
 */
import { spring, project, rubberband, velocityTracker, buzz } from './motion.js';

/** wrapper = .sw contenant .sw__under et .sw__front ; onCommit appelé une fois la ligne partie. */
export function bindSwipe(wrapper, onCommit) {
  const front = wrapper.querySelector('.sw__front');
  if (!front || front.dataset.swipe) return;
  front.dataset.swipe = '1';
  const track = velocityTracker();
  let x = 0;
  let x0 = 0;
  let y0 = 0;
  let pointer = null;
  let decided = false;
  let dragged = false;
  let stop = () => {};
  const set = v => {
    x = v;
    front.style.transform = v ? `translateX(${v}px)` : '';
    wrapper.style.setProperty('--p', String(Math.max(0, Math.min(1, v / (front.offsetWidth * 0.45 || 1)))));
  };

  front.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    stop();
    pointer = e.pointerId;
    x0 = e.clientX - x;
    y0 = e.clientY;
    decided = false;
    dragged = false;
    track.reset();
    track.push(e.clientX);
  });
  front.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!decided) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      decided = true;
      // Défilement vertical ou geste vers la gauche : on laisse faire la page.
      if (Math.abs(dy) > Math.abs(dx) || dx < 0) {
        pointer = null;
        return;
      }
      dragged = true;
      front.setPointerCapture?.(e.pointerId);
    }
    track.push(e.clientX);
    const w = front.offsetWidth;
    set(dx < 0 ? rubberband(dx, w) : dx > w * 0.75 ? w * 0.75 + rubberband(dx - w * 0.75, w) : dx);
  });
  const end = e => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (!dragged) return;
    const w = front.offsetWidth;
    const v = track.velocity();
    if (e.type === 'pointerup' && x + project(v) > w * 0.45) {
      buzz(12);
      stop = spring(x, w, { velocity: v, response: 0.3 }, set, () => {
        onCommit();
        // La ligne reste « partie » le temps que la feuille s'ouvre, puis revient.
        setTimeout(() => set(0), 400);
      });
    } else stop = spring(x, 0, { velocity: v, response: 0.35, damping: 0.8 }, set);
  };
  front.addEventListener('pointerup', end);
  front.addEventListener('pointercancel', end);
  // Après un glissé, le « clic » qui suit le relâché n'ouvre rien.
  front.addEventListener(
    'click',
    e => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true
  );
}

/*
 * Champ « pièces jointes » réutilisable (photos ou PDF) des formulaires :
 * documents et interventions d'entretien (dont la facture est rangée
 * automatiquement dans les documents).
 *
 * Les fichiers ne sont écrits qu'à l'enregistrement du formulaire (`commit`) :
 * nouveaux fichiers envoyés (local + cloud), fichiers retirés supprimés.
 */
import { $, esc } from '../core/utils.js';
import { MAX_FILES, makeId } from '../core/schema.js';
import { saveFile, deleteFile, readUserFile, openFile } from '../services/files.js';
import { openPhotoLightbox } from './dialog.js';
import { toastError } from './toast.js';
import { icon } from './icons.js';

/** Ouvre une pièce jointe enregistrée : photo en grand, PDF dans un nouvel onglet. */
export const openAttachment = f => openFile(f.id, f.name, { lightbox: openPhotoLightbox }).catch(error => toastError(error.message));

/**
 * @param {{ list: string, input: string, label: string, empty?: string, more?: string }} ids
 */
export function createFileField({ list, input, label, empty = 'Ajouter photos ou PDF', more = 'Ajouter d’autres fichiers' }) {
  let pending = []; // { id, name, mime, data? (nouveau fichier, pas encore enregistré) }
  let removed = []; // ids de fichiers enregistrés retirés du formulaire

  const render = () => {
    $(list).innerHTML = pending
      .map(
        (f, i) => `<div class="file-attach__current" data-file-index="${i}">
        <span class="file-attach__icon">${icon(f.mime.startsWith('image/') ? 'image' : 'doc', 16)}</span>
        <span class="file-attach__name">${esc(f.name || 'Fichier')}</span>
        <button type="button" class="icon-btn icon-btn--sm" data-file-remove="${i}" aria-label="Retirer">${icon('close', 16)}</button>
      </div>`
      )
      .join('');
    $(label).textContent = pending.length ? more : empty;
  };

  $(input).addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    const room = MAX_FILES - pending.length;
    const errors = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await readUserFile(file);
        pending.push({ id: makeId(), name: file.name, mime: data.slice(5, data.indexOf(';')), data });
      } catch (error) {
        errors.push(`${file.name} : ${error.message}`);
      }
    }
    if (files.length > room) errors.push(`${MAX_FILES} fichiers maximum.`);
    render();
    if (errors.length) toastError(errors.join(' '));
    e.target.value = '';
  });

  $(list).addEventListener('click', e => {
    const rm = e.target.closest('[data-file-remove]');
    if (rm) {
      const [f] = pending.splice(Number(rm.dataset.fileRemove), 1);
      if (f && !f.data) removed.push(f.id);
      return render();
    }
    const pill = e.target.closest('[data-file-index]');
    const f = pill && pending[Number(pill.dataset.fileIndex)];
    if (!f) return;
    if (f.data) {
      if (f.data.startsWith('data:image/')) openPhotoLightbox(f.data, f.name);
      else window.open(f.data, '_blank');
    } else openAttachment(f);
  });

  return {
    /** Fichiers déjà enregistrés ({ id, name, mime }) à afficher dans le formulaire. */
    set(files) {
      pending = (files || []).map(f => ({ ...f }));
      removed = [];
      $(input).value = '';
      render();
    },
    /** Enregistre les nouveaux fichiers, supprime les retirés ; retourne la liste à stocker. */
    async commit() {
      await Promise.all(pending.filter(f => f.data).map(f => saveFile(f.id, f.data)));
      removed.forEach(id => deleteFile(id));
      removed = [];
      pending = pending.map(({ id, name, mime }) => ({ id, name, mime }));
      return pending.map(f => ({ ...f }));
    }
  };
}

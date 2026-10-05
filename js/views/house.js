/* Fiche de la maison : identité, achat, crédit en cours. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { HEATINGS, presetReminders } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { toNumber, numInput, positive } from './common.js';

const NUMBER_FIELDS = ['year', 'surface', 'land', 'rooms', 'purchasePrice', 'purchaseFees', 'estimatedValue', 'loanPrincipal', 'loanRate', 'loanMonths'];

export function openHouse() {
  const h = store.home();
  const form = $('#houseForm');
  form.reset();
  clearErrors(form);
  form.elements.heating.innerHTML = HEATINGS.map(x => `<option>${esc(x)}</option>`).join('');
  form.elements.name.value = h?.name || '';
  form.elements.type.value = h?.type || 'Maison';
  form.elements.address.value = h?.address || '';
  form.elements.heating.value = h?.heating || 'Gaz';
  form.elements.dpe.value = h?.dpe || '';
  form.elements.purchaseDate.value = h?.purchaseDate || '';
  form.elements.loanStart.value = h?.loanStart || '';
  NUMBER_FIELDS.forEach(k => (form.elements[k].value = numInput(h?.[k])));
  $('#hoHeatingHelp').hidden = Boolean(h) || store.get('reminders').length > 0;
  openSheet('houseSheet', { focus: false });
}

const schema = {
  name: [rules.required('Le nom'), rules.maxLength(80)],
  address: [rules.maxLength(160)],
  year: [positive('L’année', { integer: true, max: 2200 })],
  surface: [positive('La surface', { max: 100000 })],
  land: [positive('Le terrain', { max: 10000000 })],
  rooms: [positive('Le nombre de pièces', { integer: true, max: 100 })],
  purchaseDate: [rules.date()],
  purchasePrice: [positive('Le prix')],
  purchaseFees: [positive('Les frais')],
  estimatedValue: [positive('La valeur')],
  loanPrincipal: [positive('Le montant')],
  loanRate: [positive('Le taux', { max: 30 })],
  loanMonths: [positive('La durée', { integer: true, max: 600 }), (v, all) => (toNumber(all.loanPrincipal) && !toNumber(v) ? 'Indiquez la durée du crédit.' : null)],
  loanStart: [rules.date()]
};

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, schema);
  if (!valid) return showErrors(form, errors);
  const first = !store.home();
  const home = { ...val };
  NUMBER_FIELDS.forEach(k => (home[k] = toNumber(val[k]) || 0));
  const patch = { home };
  // Première création : plan d'entretien pré-rempli selon le chauffage (s'il est encore vide).
  if (first && !store.get('reminders').length) patch.reminders = presetReminders(home.heating);
  store.setKeys(patch);
  closeSheet('houseSheet');
  toast(first ? 'Maison enregistrée · plan d’entretien pré-rempli' : 'Fiche mise à jour');
}

export function initHouse() {
  $('#houseForm').addEventListener('submit', onSubmit);
}

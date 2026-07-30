/**
 * Strato di accesso ai dati.
 *
 * Tutto il resto dell'applicazione passa da qui e non conosce la forma fisica
 * del dataset. Oggi sono file JSON caricati una volta all'avvio (nessuna query
 * in runtime, che e il motivo per cui le pagine sono veloci); quando servira
 * Postgres - per i lead, le serie storiche prezzi o le query geografiche
 * AVEPA - si riscrive questo file e non i template ne la logica di matching.
 *
 * Vedi docs/fonti-dati.md, sezione "Postgres o JSON statico".
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = dirname(fileURLToPath(import.meta.url));

function carica(nomeFile) {
  return JSON.parse(readFileSync(join(dataDir, nomeFile), 'utf8'));
}

const datiColture = carica('colture.json');
const datiProvince = carica('province.json');
const datiComuni = carica('comuni.json');

const colture = Object.freeze(datiColture.colture);
const province = Object.freeze(datiProvince.province);
const comuni = Object.freeze(datiComuni.comuni);

// Indici costruiti una volta sola: le lookup per slug sono O(1).
const coltureBySlug = new Map(colture.map((c) => [c.slug, c]));
const provinceBySigla = new Map(province.map((p) => [p.sigla, p]));
const provinceBySlug = new Map(province.map((p) => [p.slug, p]));
const comuniBySlug = new Map(comuni.map((c) => [c.slug, c]));

export const TERRENI = Object.freeze(['argilloso', 'sabbioso', 'limoso', 'misto']);

export function getColture() {
  return colture;
}

export function getColtura(slug) {
  return coltureBySlug.get(slug) ?? null;
}

export function getColtureByProvincia(sigla) {
  return colture.filter((c) => c.province.includes(sigla));
}

export function getProvince() {
  return province;
}

/** Accetta indifferentemente sigla (RO) o slug (rovigo). */
export function getProvincia(chiave) {
  if (!chiave) return null;
  return provinceBySigla.get(String(chiave).toUpperCase()) ?? provinceBySlug.get(String(chiave).toLowerCase()) ?? null;
}

export function getComuni() {
  return comuni;
}

export function getComune(slug) {
  return comuniBySlug.get(slug) ?? null;
}

export function getComuniByProvincia(sigla) {
  return comuni.filter((c) => c.provincia === sigla);
}

export function getZone() {
  return datiComuni.zone;
}

export function getMeta() {
  return {
    colture: datiColture._meta,
    province: datiProvince._meta,
    comuni: datiComuni._meta,
  };
}

#!/usr/bin/env node
/**
 * Importa l'export CSV ISTAT dell'indice dei prezzi alla produzione
 * (dataflow 101_12, DCSP_PREZZIAGR) e produce src/data/istat-prezzi.json.
 *
 *   node scripts/importa-prezzi-istat.mjs
 *
 * COSA QUESTO DATO E' E COSA NON E'
 *
 * E' un NUMERO INDICE (base 2020 = 100), nazionale, mensile, per gruppo di
 * prodotto. Non contiene prezzi in euro al quintale e non puo quindi sostituire
 * le stime di prezzo del dataset: da un indice non si ricava un livello.
 *
 * Contiene pero una cosa che finora era dichiarata a occhio: la VOLATILITA
 * REALE dei prezzi, gruppo per gruppo. E la differenza tra gruppi e enorme -
 * i cereali sono passati da 97 a 198 e sono tornati a 119 in sei anni, il vino
 * si e mosso tra 103 e 115 - mentre il modello usava un coefficiente di
 * variabilita uguale per tutta la categoria.
 *
 * Da qui si ricavano due cose usate dal calcolatore:
 *
 *  1. il coefficiente di variazione dei prezzi annui, che sostituisce la parte
 *     "prezzo" del coefficiente di variabilita della PLV;
 *  2. la fase di mercato corrente (ultimo indice rispetto alla media triennale
 *     e al picco), che e un'informazione decisionale in se.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv } from './lib/csv-sdmx.mjs';

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cartellaRaw = join(radice, 'src', 'data', 'raw');

/** Anni completi da usare per le medie annue: l'anno in corso e parziale. */
const anniCompleti = (anni) => anni.slice(0, -1);

function trovaFile() {
  const candidati = readdirSync(cartellaRaw).filter(
    (n) => n.toLowerCase().endsWith('.csv') && n.includes('PREZZIAGR'),
  );
  if (candidati.length === 0) {
    throw new Error(
      `Nessun export DCSP_PREZZIAGR in ${cartellaRaw}.\n` +
        "  Scarica dal databrowser ISTAT il dataflow 101_12 e mettilo li.",
    );
  }
  return join(cartellaRaw, candidati[0]);
}

const percorso = trovaFile();
console.log(`Leggo ${percorso}`);

const righe = parseCsv(readFileSync(percorso, 'utf8'), {
  ancoraPeriodo: /^\d{4}-\d{2}$/,
  campoDescrittivo: 'Prodotti venduti',
}).filter((r) => /^\d{4}-\d{2}$/.test(r.TIME_PERIOD ?? ''));

console.log(`${righe.length} osservazioni mensili`);

const gruppi = new Map();
for (const r of righe) {
  const valore = Number.parseFloat(r.Osservazione);
  if (!Number.isFinite(valore)) continue;
  if (!gruppi.has(r.SOLD_PRODUCTS)) {
    gruppi.set(r.SOLD_PRODUCTS, { nome: r['Prodotti venduti'], mesi: new Map() });
  }
  gruppi.get(r.SOLD_PRODUCTS).mesi.set(r.TIME_PERIOD, valore);
}

const risultato = {};

for (const [codice, g] of gruppi) {
  const mesi = [...g.mesi.entries()].sort(([a], [b]) => a.localeCompare(b));

  // Medie annue: smorzano la stagionalita, che non e volatilita di mercato ma
  // ciclo prevedibile, e restituiscono la variabilita che conta per una scelta
  // colturale presa una volta l'anno.
  const perAnno = new Map();
  for (const [periodo, valore] of mesi) {
    const anno = periodo.slice(0, 4);
    if (!perAnno.has(anno)) perAnno.set(anno, []);
    perAnno.get(anno).push(valore);
  }

  const anni = [...perAnno.keys()].sort();
  const medieAnnue = {};
  for (const anno of anni) {
    const v = perAnno.get(anno);
    medieAnnue[anno] = Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10;
  }

  const usabili = anniCompleti(anni).map((a) => medieAnnue[a]);
  const media = usabili.reduce((s, v) => s + v, 0) / usabili.length;
  const varianza = usabili.reduce((s, v) => s + (v - media) ** 2, 0) / usabili.length;
  const cv = Math.sqrt(varianza) / media;

  const ultimo = mesi[mesi.length - 1];
  const recenti = usabili.slice(-3);
  const mediaRecente = recenti.reduce((s, v) => s + v, 0) / recenti.length;
  const picco = Math.max(...mesi.map(([, v]) => v));

  risultato[codice] = {
    nome: g.nome.replace(/^'|'$/g, '').replace(/"/g, ''),
    anni_completi: anniCompleti(anni),
    medie_annue: medieAnnue,
    coefficiente_variazione: Math.round(cv * 1000) / 1000,
    ultimo_periodo: ultimo[0],
    ultimo_indice: ultimo[1],
    picco_indice: picco,
    scarto_da_media_recente: Math.round(((ultimo[1] / mediaRecente - 1) * 100) * 10) / 10,
    scarto_da_picco: Math.round(((ultimo[1] / picco - 1) * 100) * 10) / 10,
  };
}

const destinazione = join(radice, 'src', 'data', 'istat-prezzi.json');
writeFileSync(
  destinazione,
  `${JSON.stringify(
    {
      _meta: {
        fonte: 'ISTAT, dataflow 101_12 (DCSP_PREZZIAGR), indice dei prezzi alla produzione, base 2020=100',
        licenza: 'CC-BY: citare ISTAT come fonte',
        natura:
          "E' un numero indice, non un prezzo: da qui NON si ricavano euro al quintale. Serve per la volatilita misurata e per la fase di mercato.",
        territorio: 'Italia (nazionale)',
        territorio_nota:
          "L'indice non e disponibile su base regionale: la volatilita e quindi nazionale, applicata al Veneto.",
        frequenza: 'mensile',
        gruppi: Object.keys(risultato).length,
        importato: new Date().toISOString().slice(0, 10),
      },
      gruppi: risultato,
    },
    null,
    2,
  )}\n`,
);

console.log(`\n${Object.keys(risultato).length} gruppi -> ${destinazione}\n`);
console.log('Volatilita misurata (coefficiente di variazione delle medie annue):');
Object.entries(risultato)
  .sort(([, a], [, b]) => b.coefficiente_variazione - a.coefficiente_variazione)
  .forEach(([cod, g]) => {
    console.log(
      `  ${cod.padEnd(17)} ${String(g.coefficiente_variazione).padStart(6)}  ${g.nome.slice(0, 34).padEnd(34)} oggi ${String(g.ultimo_indice).padStart(4)} (${g.scarto_da_picco > 0 ? '+' : ''}${g.scarto_da_picco}% dal picco)`,
    );
  });

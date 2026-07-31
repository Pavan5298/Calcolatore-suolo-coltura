#!/usr/bin/env node
/**
 * Importa l'export CSV del databrowser ISTAT (dataflow 101_1015, Coltivazioni)
 * e produce src/data/istat-veneto.json.
 *
 *   node scripts/importa-istat-csv.mjs [--file=<percorso>]
 *
 * L'export del databrowser e in "SDMX CSV": una riga per osservazione, con le
 * dimensioni in colonna. Le dimensioni che ci servono:
 *
 *   REF_AREA       territorio (qui ITD3 = Veneto)
 *   TYPE_OF_CROP   codice della coltura
 *   DATA_TYPE      indicatore (superficie / produzione)
 *   TIME_PERIOD    anno
 *   Osservazione   valore
 *
 * resa (q/ha) = produzione raccolta / superficie in produzione
 *
 * Per i seminativi ISTAT non compila la superficie in produzione: si usa la
 * superficie totale, che per una coltura annuale coincide di fatto. Per le
 * arboree la distinzione conta - un impianto giovane non e ancora in produzione -
 * e li la superficie in produzione c'e ed e quella corretta.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv } from './lib/csv-sdmx.mjs';

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cartellaRaw = join(radice, 'src', 'data', 'raw');

const SUPERFICIE_IN_PRODUZIONE = 'PA_EXT';
const SUPERFICIE_TOTALE = 'ART';
const PRODUZIONE_RACCOLTA = 'HP_Q_EXT';
const PRODUZIONE_TOTALE = 'TP_QUIN_EXT';

function trovaFile(opzioni) {
  if (opzioni.file) return resolve(radice, opzioni.file);
  // Il filtro sul dataflow e necessario: nella stessa cartella convivono piu
  // export ISTAT e prendere il primo in ordine alfabetico significa leggere
  // l'indice dei prezzi al posto delle coltivazioni.
  const candidati = readdirSync(cartellaRaw).filter(
    (n) => n.toLowerCase().endsWith('.csv') && n.includes('COLTIVAZIONI'),
  );
  if (candidati.length === 0) {
    throw new Error(
      `Nessun export DCSP_COLTIVAZIONI in ${cartellaRaw}.\n` +
        '  Scarica dal databrowser ISTAT il dataflow 101_1015 e mettilo li.',
    );
  }
  return join(cartellaRaw, candidati[0]);
}

const opzioni = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

const percorso = trovaFile(opzioni);
console.log(`Leggo ${percorso}`);

const righe = parseCsv(readFileSync(percorso, 'utf8'), {
  ancoraPeriodo: /^\d{4}$/,
  campoDescrittivo: 'Tipo di coltivazione',
});

// Alcune denominazioni ISTAT contengono virgole non quotate ("Altri cereali
// n.c.a. (miglio, scagliola, ecc.)") e sfasano le colonne. Sono aggregati
// residuali che non useremmo comunque: si scartano dichiarandolo.
const valide = righe.filter((r) => /^\d{4}$/.test(r.TIME_PERIOD ?? ''));
const scartate = righe.length - valide.length;

const territori = new Set(valide.map((r) => r.REF_AREA));
const anni = [...new Set(valide.map((r) => r.TIME_PERIOD))].sort();

console.log(`${valide.length} osservazioni valide (${scartate} righe scartate per denominazione malformata)`);
console.log(`Territori: ${[...territori].join(', ')}`);
console.log(`Anni: ${anni.join(', ')}`);

const colture = new Map();

for (const r of valide) {
  if (!colture.has(r.TYPE_OF_CROP)) {
    colture.set(r.TYPE_OF_CROP, { codice: r.TYPE_OF_CROP, nome: r['Tipo di coltivazione'], osservazioni: {} });
  }
  const valore = Number.parseFloat(r.Osservazione);
  if (Number.isFinite(valore)) {
    colture.get(r.TYPE_OF_CROP).osservazioni[`${r.DATA_TYPE}|${r.TIME_PERIOD}`] = valore;
  }
}

const risultato = {};
let conResa = 0;

for (const [codice, c] of colture) {
  const perAnno = {};

  for (const anno of anni) {
    const superficie =
      c.osservazioni[`${SUPERFICIE_IN_PRODUZIONE}|${anno}`] ?? c.osservazioni[`${SUPERFICIE_TOTALE}|${anno}`];
    const produzione =
      c.osservazioni[`${PRODUZIONE_RACCOLTA}|${anno}`] ?? c.osservazioni[`${PRODUZIONE_TOTALE}|${anno}`];

    if (superficie > 0 && produzione > 0) {
      perAnno[anno] = {
        superficie_ha: Math.round(superficie),
        produzione_q: Math.round(produzione),
        resa_q_ha: Math.round((produzione / superficie) * 10) / 10,
      };
    }
  }

  const anniConResa = Object.keys(perAnno);
  if (anniConResa.length === 0) continue;
  conResa += 1;

  const rese = anniConResa.map((a) => perAnno[a].resa_q_ha);
  const superfici = anniConResa.map((a) => perAnno[a].superficie_ha);

  risultato[codice] = {
    nome: c.nome,
    anni: perAnno,
    resa_media_q_ha: Math.round((rese.reduce((s, v) => s + v, 0) / rese.length) * 10) / 10,
    superficie_max_ha: Math.max(...superfici),
  };
}

const destinazione = join(radice, 'src', 'data', 'istat-veneto.json');
writeFileSync(
  destinazione,
  `${JSON.stringify(
    {
      _meta: {
        fonte: 'ISTAT, dataflow 101_1015 (DCSP_COLTIVAZIONI), export databrowser',
        licenza: 'CC-BY: citare ISTAT come fonte',
        territorio: [...territori].join(', '),
        territorio_nota:
          "L'export e a livello REGIONALE (Veneto), non provinciale: le rese qui dentro valgono per l'intera regione.",
        anni,
        anni_nota:
          'Serie troppo corta per calcolare i percentili della PLV annuale: servono almeno 5 anni. Fino ad allora il range si costruisce con un coefficiente di variabilita dichiarato.',
        file_origine: percorso.split('/').pop(),
        importato: new Date().toISOString().slice(0, 10),
        colture: conResa,
      },
      colture: risultato,
    },
    null,
    2,
  )}\n`,
);

console.log(`\n${conResa} colture con resa calcolabile -> ${destinazione}`);

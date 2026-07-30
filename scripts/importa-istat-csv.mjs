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

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cartellaRaw = join(radice, 'src', 'data', 'raw');

const SUPERFICIE_IN_PRODUZIONE = 'PA_EXT';
const SUPERFICIE_TOTALE = 'ART';
const PRODUZIONE_RACCOLTA = 'HP_Q_EXT';
const PRODUZIONE_TOTALE = 'TP_QUIN_EXT';

/** Parser CSV: gestisce virgolette doppie e separatore virgola. */
export function parseCsv(testo) {
  const righe = [];
  let riga = [];
  let campo = '';
  let inVirgolette = false;

  for (let i = 0; i < testo.length; i += 1) {
    const c = testo[i];
    if (inVirgolette) {
      if (c === '"') {
        if (testo[i + 1] === '"') { campo += '"'; i += 1; } else { inVirgolette = false; }
      } else campo += c;
      continue;
    }
    // Una virgoletta apre un campo quotato SOLO a inizio campo. L'intestazione
    // dell'export ISTAT contiene una virgoletta spuria a meta campo
    // ('Stato dell"'osservazione'): trattarla come delimitatore farebbe
    // inghiottire il resto del file in un unico campo.
    if (c === '"' && campo === '') { inVirgolette = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    campo += c;
  }
  if (campo !== '' || riga.length > 0) { riga.push(campo); righe.push(riga); }
  if (righe.length === 0) return [];

  const intestazione = righe[0].map((k) => k.trim());

  // Nell'export ISTAT alcuni testi lunghi (denominazioni di coltura, note
  // metodologiche) sono racchiusi tra APICI SINGOLI, che il formato CSV non
  // riconosce come quoting: le virgole interne spezzano il campo e la riga
  // risulta piu lunga dell'intestazione. Riguarda ~30% delle righe, quindi
  // scartarle non e accettabile.
  //
  // Lo sfasamento puo cadere prima o dopo le colonne che ci servono, percio non
  // si puo indicizzare ne dalla testa ne dalla coda. L'ancora affidabile e
  // TIME_PERIOD: e l'anno, quindi il primo campo di quattro cifre dopo il
  // codice coltura. Da li si ricavano nome (tutto quel che precede) e valore
  // (il campo successivo), e il resto della riga si puo ignorare.
  const iNome = intestazione.indexOf('Tipo di coltivazione');
  const CAMPI_TESTA = ['FREQ', 'Frequenza', 'REF_AREA', 'Territorio', 'DATA_TYPE', 'Indicatore', 'TYPE_OF_CROP'];

  return righe.slice(1).map((r) => {
    const posPeriodo = r.findIndex((v, i) => i >= iNome && /^\d{4}$/.test(v));
    if (posPeriodo < 0) return null;

    const record = Object.fromEntries(CAMPI_TESTA.map((k, i) => [k, r[i]]));
    record[intestazione[iNome]] = r.slice(iNome, posPeriodo).join(',');
    record.TIME_PERIOD = r[posPeriodo];
    record.Osservazione = r[posPeriodo + 1];
    return record;
  }).filter(Boolean);
}

function trovaFile(opzioni) {
  if (opzioni.file) return resolve(radice, opzioni.file);
  const candidati = readdirSync(cartellaRaw).filter((n) => n.toLowerCase().endsWith('.csv'));
  if (candidati.length === 0) {
    throw new Error(`Nessun CSV in ${cartellaRaw}. Scarica l'export dal databrowser ISTAT e mettilo li.`);
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

// Gli export ISTAT arrivano con BOM: va tolto prima del parsing, altrimenti la
// prima intestazione di colonna non corrisponde mai.
const righe = parseCsv(readFileSync(percorso, 'utf8').replace(/^\uFEFF/, ''));

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

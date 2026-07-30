#!/usr/bin/env node
/**
 * Importer ISTAT via API SDMX.
 *
 *   npm run import:discover        ispeziona la struttura di un dataflow
 *   npm run import:rese            scarica superfici e produzioni -> rese per anno
 *   npm run import:prezzi          scarica i prezzi dei prodotti agricoli
 *
 * Opzioni: --dataflow=<id> --dal=<anno> --al=<anno> --applica --fixture=<file>
 *
 * PERCHE ESISTE LA MODALITA "discover"
 * L'ordine e i codici delle dimensioni di un dataflow SDMX non si indovinano: la
 * chiave di query e posizionale e va costruita sulla Data Structure Definition
 * reale. La modalita discover stampa dimensioni e liste di codici, cosi la
 * mappatura in scripts/mappatura-istat.json si compila su dati veri e non su
 * ipotesi.
 *
 * NOTA SULL'AMBIENTE
 * In ambienti con policy di rete restrittiva le chiamate a esploradati.istat.it
 * possono essere bloccate (403 al gateway). In quel caso si lavora con
 * --fixture=<file> su una risposta salvata, oppure si esegue lo script da un
 * ambiente con accesso libero. Lo script distingue i due casi nel messaggio
 * d'errore invece di fallire genericamente.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cartellaRaw = join(radice, 'src', 'data', 'raw');

const BASE = 'https://esploradati.istat.it/SDMXWS/rest';

const DATAFLOW = {
  rese: {
    id: '101_1015',
    struttura: 'DCSP_COLTIVAZIONI',
    descrizione: 'Coltivazioni: superfici e produzioni, per provincia, annuale',
  },
  prezzi: {
    id: '101_12',
    struttura: 'DCSP_PREZZIAGR',
    descrizione: 'Prezzi dei prodotti agricoli',
  },
};

const ACCEPT_CSV = 'application/vnd.sdmx.data+csv;version=1.0.0';
const ACCEPT_XML = 'application/vnd.sdmx.structure+xml;version=2.1';

// ------------------------------------------------------------------ utilita

function argomenti(argv) {
  const opzioni = { comando: argv[0] ?? 'discover' };
  for (const arg of argv.slice(1)) {
    const trovato = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (trovato) opzioni[trovato[1]] = trovato[2] ?? true;
  }
  return opzioni;
}

async function scarica(url, accept) {
  let risposta;
  try {
    risposta = await fetch(url, { headers: { Accept: accept } });
  } catch (errore) {
    throw new Error(
      `Rete non raggiungibile per ${url}\n` +
        `  ${errore.message}\n` +
        '  Se stai lavorando in un ambiente con policy di rete restrittiva, usa --fixture=<file>\n' +
        '  su una risposta salvata, oppure esegui questo script da un ambiente con accesso libero.',
    );
  }

  if (risposta.status === 403) {
    throw new Error(
      `403 su ${url}\n` +
        '  Puo essere il gateway di rete dell\'ambiente, non ISTAT. Verifica aprendo la URL dal browser:\n' +
        '  se dal browser funziona, il blocco e locale e serve --fixture o un altro ambiente.',
    );
  }
  if (!risposta.ok) {
    throw new Error(`HTTP ${risposta.status} ${risposta.statusText} su ${url}`);
  }

  return risposta.text();
}

function leggiFixture(percorso) {
  console.log(`Uso la fixture ${percorso} invece della rete.`);
  return readFileSync(resolve(radice, percorso), 'utf8');
}

/** Parser CSV minimale: gestisce virgolette doppie e separatore virgola. */
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
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') { inVirgolette = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    campo += c;
  }

  if (campo !== '' || riga.length > 0) { riga.push(campo); righe.push(riga); }
  if (righe.length === 0) return [];

  const intestazione = righe[0];
  return righe.slice(1)
    .filter((r) => r.length === intestazione.length)
    .map((r) => Object.fromEntries(intestazione.map((k, i) => [k.trim(), r[i]])));
}

// ------------------------------------------------------------------ comandi

async function comandoDiscover(opzioni) {
  const chiave = opzioni.dataflow && DATAFLOW[opzioni.dataflow] ? opzioni.dataflow : 'rese';
  const df = DATAFLOW[chiave];

  console.log(`\nDataflow "${chiave}": ${df.id} (${df.struttura})`);
  console.log(`  ${df.descrizione}\n`);

  const url = `${BASE}/datastructure/IT1/${df.struttura}?references=all&detail=full`;
  console.log(`GET ${url}\n`);

  const xml = opzioni.fixture ? leggiFixture(opzioni.fixture) : await scarica(url, ACCEPT_XML);

  // Estrazione volutamente grezza: serve a leggere l'ordine delle dimensioni e i
  // codici, non a fare un parsing SDMX completo.
  const dimensioni = [...xml.matchAll(/<(?:str:)?Dimension\s+id="([^"]+)"[^>]*position="(\d+)"/g)]
    .map((m) => ({ id: m[1], posizione: Number(m[2]) }))
    .sort((a, b) => a.posizione - b.posizione);

  if (dimensioni.length === 0) {
    console.log('Nessuna dimensione riconosciuta: salva la risposta e ispezionala a mano.');
    const destinazione = join(cartellaRaw, `dsd-${df.struttura}.xml`);
    mkdirSync(cartellaRaw, { recursive: true });
    writeFileSync(destinazione, xml);
    console.log(`Risposta salvata in ${destinazione}`);
    return;
  }

  console.log('Dimensioni in ordine posizionale (questa e la chiave di query):');
  dimensioni.forEach((d) => console.log(`  ${d.posizione}. ${d.id}`));

  const chiaveEsempio = dimensioni.map(() => '').join('.');
  console.log(`\nChiave vuota (tutti i valori): ${chiaveEsempio || '(nessuna dimensione)'}`);
  console.log(`Esempio di query dati:\n  ${BASE}/data/IT1,${df.id},1.0/${chiaveEsempio}?startPeriod=2015&endPeriod=2024`);
  console.log('\nCompila scripts/mappatura-istat.json con i codici che vedi qui sopra.');
}

async function comandoDati(chiave, opzioni) {
  const df = DATAFLOW[chiave];
  const dal = opzioni.dal ?? '2015';
  const al = opzioni.al ?? String(new Date().getFullYear() - 1);

  const mappatura = JSON.parse(readFileSync(join(radice, 'scripts', 'mappatura-istat.json'), 'utf8'));
  const config = mappatura[chiave];

  if (!config || !config.chiave_query) {
    console.error(
      `\nMappatura incompleta per "${chiave}".\n` +
        '  Esegui prima:  npm run import:discover\n' +
        '  poi compila scripts/mappatura-istat.json (campo "chiave_query" e i codici delle colture).\n',
    );
    process.exitCode = 1;
    return;
  }

  const url = `${BASE}/data/IT1,${df.id},1.0/${config.chiave_query}?startPeriod=${dal}&endPeriod=${al}`;
  console.log(`GET ${url}`);

  const csv = opzioni.fixture ? leggiFixture(opzioni.fixture) : await scarica(url, ACCEPT_CSV);
  const righe = parseCsv(csv);
  console.log(`${righe.length} osservazioni ricevute.`);

  mkdirSync(cartellaRaw, { recursive: true });
  const grezzo = join(cartellaRaw, `istat-${chiave}.csv`);
  writeFileSync(grezzo, csv);
  console.log(`Risposta grezza salvata in ${grezzo}`);

  const normalizzato = join(cartellaRaw, `istat-${chiave}.json`);
  writeFileSync(normalizzato, JSON.stringify({ url, dal, al, scaricato: new Date().toISOString(), righe }, null, 2));
  console.log(`Dati normalizzati in ${normalizzato}`);

  console.log(
    '\nProssimo passo: con rese e prezzi entrambi scaricati, popolare "serie_annuale" in\n' +
      'src/data/colture.json. La PLV verra allora calcolata con i percentili sulla serie di\n' +
      'PLV annuali (vedi src/lib/plv.js) invece che dal range curato a mano.',
  );
}

// -------------------------------------------------------------------- avvio

const opzioni = argomenti(process.argv.slice(2));

try {
  if (opzioni.comando === 'discover') {
    await comandoDiscover(opzioni);
  } else if (opzioni.comando === 'rese' || opzioni.comando === 'prezzi') {
    await comandoDati(opzioni.comando, opzioni);
  } else {
    console.error(`Comando non riconosciuto: ${opzioni.comando}. Usa: discover | rese | prezzi`);
    process.exitCode = 1;
  }
} catch (errore) {
  console.error(`\n${errore.message}\n`);
  process.exitCode = 1;
}

/**
 * Test delle rotte: verificano che ogni pagina renda HTML valido e che i
 * metadati SEO che il progetto considera essenziali siano effettivamente nel
 * primo byte di risposta, non aggiunti da JavaScript.
 */

process.env.PUBLIC_BASE_URL = 'https://esempio.test';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { app } from '../src/server.js';

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((risolvi) => server.once('listening', risolvi));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const prendi = async (percorso) => {
  const risposta = await fetch(`${base}${percorso}`, { redirect: 'manual' });
  return { stato: risposta.status, tipo: risposta.headers.get('content-type'), corpo: await risposta.text() };
};

describe('rotte principali', () => {
  it('la home risponde con il form di calcolo', async () => {
    const r = await prendi('/');
    assert.equal(r.stato, 200);
    assert.match(r.corpo, /<form[^>]+action="\/risultato"/);
    assert.match(r.corpo, /name="provincia"/);
    assert.match(r.corpo, /name="terreno"/);
    assert.match(r.corpo, /name="superficie"/);
    assert.match(r.corpo, /name="irrigazione"/);
  });

  it('la pagina risultato rende le colture lato server', async () => {
    const r = await prendi('/risultato?provincia=rovigo&terreno=argilloso&superficie=20&irrigazione=si');
    assert.equal(r.stato, 200);
    assert.match(r.corpo, /colture compatibili/i);
    assert.match(r.corpo, /PLV per ettaro/);
    assert.match(r.corpo, /Margine lordo per ettaro/);
    assert.match(r.corpo, /Margine per ora/);
  });

  it('il link al risultato e canonico e ricostruisce lo stesso calcolo', async () => {
    const percorso = '/risultato?provincia=rovigo&terreno=argilloso&superficie=20&irrigazione=si';
    const primo = await prendi(percorso);
    const secondo = await prendi(percorso);
    assert.equal(primo.corpo, secondo.corpo, 'lo stesso link deve produrre lo stesso risultato');
    assert.match(primo.corpo, /<link rel="canonical" href="https:\/\/esempio\.test\/risultato\?/);
  });

  it('risolve il comune alla sua provincia', async () => {
    const r = await prendi('/risultato?comune=porto-tolle&superficie=8&irrigazione=si');
    assert.equal(r.stato, 200);
    assert.match(r.corpo, /Porto Tolle/);
    assert.match(r.corpo, /Rovigo/);
  });

  it('risponde 200 con spiegazione a un link malformato, senza indicizzarlo', async () => {
    const r = await prendi('/risultato?provincia=marte&terreno=lava&superficie=abc');
    assert.equal(r.stato, 200);
    assert.match(r.corpo, /Parametri non validi/);
    assert.match(r.corpo, /name="robots" content="noindex/);
  });

  it('rifiuta superfici fuori scala', async () => {
    const r = await prendi('/risultato?provincia=rovigo&terreno=argilloso&superficie=99999&irrigazione=si');
    assert.match(r.corpo, /Parametri non validi/);
  });

  it('serve la landing di comune', async () => {
    const r = await prendi('/cosa-coltivare-a/adria');
    assert.equal(r.stato, 200);
    assert.match(r.corpo, /Cosa coltivare a Adria/);
    assert.match(r.corpo, /application\/ld\+json/);
    assert.match(r.corpo, /FAQPage/);
  });

  it('serve la landing di provincia', async () => {
    const r = await prendi('/cosa-coltivare-in/belluno');
    assert.equal(r.stato, 200);
    assert.match(r.corpo, /Cosa coltivare in provincia di Belluno/);
  });

  it('serve l elenco e le schede coltura', async () => {
    const elenco = await prendi('/colture');
    assert.equal(elenco.stato, 200);
    assert.match(elenco.corpo, /<table/);

    const scheda = await prendi('/colture/pomodoro-da-industria');
    assert.equal(scheda.stato, 200);
    assert.match(scheda.corpo, /Solanum lycopersicum/);
    assert.match(scheda.corpo, /Resa ISTAT/);
  });

  it('serve la pagina metodologia con le fonti dichiarate', async () => {
    const r = await prendi('/metodologia');
    assert.equal(r.stato, 200);
    assert.match(r.corpo, /DCSP_COLTIVAZIONI/);
    assert.match(r.corpo, /negativamente correlati/);
  });

  it('risponde 404 su una coltura inesistente', async () => {
    const r = await prendi('/colture/banana-polesana');
    assert.equal(r.stato, 404);
    assert.match(r.corpo, /noindex/);
  });
});

describe('file per i crawler', () => {
  it('robots.txt punta alla sitemap assoluta', async () => {
    const r = await prendi('/robots.txt');
    assert.equal(r.stato, 200);
    assert.match(r.corpo, /Sitemap: https:\/\/esempio\.test\/sitemap\.xml/);
  });

  it('la sitemap elenca province, comuni e colture', async () => {
    const r = await prendi('/sitemap.xml');
    assert.equal(r.stato, 200);
    assert.match(r.tipo, /xml/);
    assert.match(r.corpo, /cosa-coltivare-in\/rovigo/);
    assert.match(r.corpo, /cosa-coltivare-a\/porto-tolle/);
    assert.match(r.corpo, /colture\/mais/);
    assert.match(r.corpo, /<loc>https:\/\/esempio\.test\//);
  });
});

describe('requisiti SEO su ogni pagina indicizzabile', () => {
  const pagine = [
    '/',
    '/colture',
    '/colture/mais',
    '/metodologia',
    '/cosa-coltivare-a/adria',
    '/cosa-coltivare-in/verona',
    '/risultato?provincia=padova&terreno=limoso&superficie=15&irrigazione=si',
  ];

  for (const percorso of pagine) {
    it(`${percorso} ha title, description e canonical`, async () => {
      const r = await prendi(percorso);
      assert.equal(r.stato, 200);

      const titolo = /<title>([^<]+)<\/title>/.exec(r.corpo);
      assert.ok(titolo, 'title mancante');
      assert.ok(titolo[1].length >= 15 && titolo[1].length <= 120, `title di lunghezza anomala: ${titolo[1].length}`);

      const descrizione = /<meta name="description" content="([^"]+)">/.exec(r.corpo);
      assert.ok(descrizione, 'meta description mancante');
      assert.ok(descrizione[1].length >= 50, `description troppo corta: ${descrizione[1].length}`);

      assert.match(r.corpo, /<link rel="canonical" href="https:\/\/esempio\.test/);
      assert.match(r.corpo, /<html lang="it">/);
      assert.doesNotMatch(r.corpo, /name="robots" content="noindex/);
      assert.match(r.corpo, /<h1[^>]*>/);
      assert.match(r.corpo, /property="og:title"/);
    });
  }
});

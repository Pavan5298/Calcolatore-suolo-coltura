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

describe('dati strutturati e crawl budget', () => {
  it('la home espone il tag di verifica per Google Search Console', async () => {
    // Se questo tag sparisce, il sito esce da Search Console e si perdono i dati
    // di ricerca senza nessun segnale visibile. Il test lo blocca.
    const r = await prendi('/');
    assert.match(
      r.corpo,
      /<meta name="google-site-verification" content="j_lo4dfiCd4wq7JrG_j0p1eD-2Q7zyasHK7FZhxKIOs">/,
    );
  });

  it('la home dichiara l identita del sito', async () => {
    const r = await prendi('/');
    assert.match(r.corpo, /"@type":"WebSite"/);
  });

  it('le landing di zona espongono FAQ e briciole di pane', async () => {
    const r = await prendi('/cosa-coltivare-a/adria');
    assert.match(r.corpo, /"@type":"FAQPage"/);
    assert.match(r.corpo, /"@type":"BreadcrumbList"/);
    // le FAQ devono coprire le domande che la gente cerca davvero
    assert.match(r.corpo, /Quanto rende un ettaro/);
    assert.match(r.corpo, /poca manodopera/);
  });

  it('le schede coltura espongono Article con data di aggiornamento', async () => {
    const r = await prendi('/colture/mais');
    assert.match(r.corpo, /"@type":"Article"/);
    assert.match(r.corpo, /"dateModified":"\d{4}-\d{2}-\d{2}"/);
  });

  it('robots.txt protegge il crawl budget dalle varianti del risultato', async () => {
    // La combinatoria dei parametri e enorme: scansionarla brucerebbe il budget
    // su pagine quasi identiche invece che sulle landing.
    const r = await prendi('/robots.txt');
    assert.match(r.corpo, /Disallow: \/risultato\?/);
  });

  it('la sitemap dichiara lastmod e priorita', async () => {
    const r = await prendi('/sitemap.xml');
    assert.match(r.corpo, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    assert.match(r.corpo, /<priority>1\.0<\/priority>/);
    // le landing di zona e coltura devono avere priorita superiore alle pagine di servizio
    assert.match(r.corpo, /cosa-coltivare-in\/rovigo<\/loc><lastmod>[^<]+<\/lastmod><changefreq>monthly<\/changefreq><priority>0\.9/);
  });

  it('comprime le risposte HTML', async () => {
    const risposta = await fetch(`${base}/colture`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(risposta.headers.get('content-encoding'), 'gzip');
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

import compression from 'compression';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TERRENI,
  getColtura,
  getColture,
  getComune,
  getComuni,
  getComuniByProvincia,
  getMeta,
  getProvincia,
  getProvince,
  getZone,
} from './data/index.js';
import {
  LIVELLI_CALCARE,
  LIVELLI_DRENAGGIO,
  LIVELLI_MANODOPERA,
  LIVELLI_SALINITA,
  ORIZZONTI,
  suggerisci,
} from './lib/matching.js';
import { analizzaTessitura, caratteristicheTessitura, profiloDaClasse } from './lib/tessitura.js';
import { plvPerEttaro } from './lib/plv.js';
import {
  ETICHETTE_IRRIGAZIONE,
  etichettaAffidabilita,
  formattaEttari,
  formattaEuro,
  formattaNumero,
} from './lib/format.js';
import {
  SITO,
  jsonLdBriciole,
  jsonLdColtura,
  jsonLdFaqZona,
  jsonLdRisultato,
  jsonLdSito,
  percorsoRisultato,
  urlAssoluto,
} from './lib/seo.js';

const radice = dirname(fileURLToPath(import.meta.url));
const app = express();

// La compressione e la singola ottimizzazione di velocita con il rapporto
// beneficio/costo piu alto: una pagina risultato passa da ~75 KB a ~12 KB, e il
// tempo di caricamento e un fattore di posizionamento oltre che di abbandono.
app.use(compression());

app.set('view engine', 'ejs');
app.set('views', join(radice, 'views'));
app.disable('x-powered-by');

// Gli asset statici non cambiano tra i deploy: cache lunga, cosi il costo di
// rete per visita ripetuta e zero.
app.use(
  express.static(join(radice, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0,
  }),
);

// Helper disponibili in tutti i template.
app.locals.sito = SITO;
app.locals.formattaEuro = formattaEuro;
app.locals.formattaNumero = formattaNumero;
app.locals.formattaEttari = formattaEttari;
app.locals.etichettaAffidabilita = etichettaAffidabilita;
app.locals.etichetteIrrigazione = ETICHETTE_IRRIGAZIONE;
app.locals.urlAssoluto = urlAssoluto;
app.locals.percorsoRisultato = percorsoRisultato;
app.locals.jsonLdSito = jsonLdSito;

const PH_MIN = 3;
const PH_MAX = 10;
const SUPERFICIE_MIN = 0.1;
const SUPERFICIE_MAX = 5000;
const SUPERFICIE_PREDEFINITA = 10;

/**
 * Valida e normalizza i parametri di ricerca.
 * Ritorna sempre un oggetto: gli errori sono dati, non eccezioni, perche la
 * pagina risultato deve poter rispondere 200 con un messaggio utile anche
 * quando arriva un link condiviso malformato.
 */
function leggiCriteri(query) {
  const errori = [];

  const comune = query.comune ? getComune(String(query.comune).toLowerCase()) : null;

  let provincia = getProvincia(query.provincia);
  if (!provincia && comune) provincia = getProvincia(comune.provincia);
  if (!provincia) errori.push('Provincia non riconosciuta.');

  // Tessitura: le percentuali da analisi del suolo, se ci sono, hanno la
  // precedenza sulla classe scelta a mano. E il dato piu preciso dei due, e chi
  // si prende la briga di inserirle si aspetta che vengano usate.
  const percentuali = ['sabbia', 'limo', 'argilla'].map((k) =>
    Number.parseFloat(String(query[k] ?? '').replace(',', '.')),
  );
  const haPercentuali = percentuali.every((v) => Number.isFinite(v));

  let tessitura = null;
  if (haPercentuali) {
    const esito = analizzaTessitura(...percentuali);
    if (esito.valido) tessitura = esito;
    else errori.push(esito.errore);
  }

  if (!tessitura) {
    let classe = query.terreno ? String(query.terreno).toLowerCase() : null;
    if (!classe && comune) classe = comune.terreno_prevalente;
    tessitura = profiloDaClasse(classe);
    if (!tessitura) {
      errori.push(`Tipo di terreno non riconosciuto. Valori ammessi: ${TERRENI.join(', ')}.`);
    }
  }

  const superficieGrezza = Number.parseFloat(String(query.superficie ?? '').replace(',', '.'));
  let superficieHa = Number.isFinite(superficieGrezza) ? superficieGrezza : null;
  if (superficieHa === null) {
    errori.push('Superficie mancante o non numerica.');
  } else if (superficieHa < SUPERFICIE_MIN || superficieHa > SUPERFICIE_MAX) {
    errori.push(`La superficie deve essere tra ${SUPERFICIE_MIN} e ${SUPERFICIE_MAX} ettari.`);
    superficieHa = null;
  } else {
    superficieHa = Math.round(superficieHa * 100) / 100;
  }

  const irrigazione = ['si', 'sì', 'true', '1', 'on'].includes(String(query.irrigazione ?? '').toLowerCase());

  // Parametri agronomici facoltativi: se assenti restano null e non incidono su
  // nessuna coltura. Un valore fuori scala e un errore dichiarato, non un
  // silenzioso "ignoro e vado avanti".
  const phGrezzo = Number.parseFloat(String(query.ph ?? '').replace(',', '.'));
  let ph = null;
  if (String(query.ph ?? '').trim() !== '') {
    if (!Number.isFinite(phGrezzo) || phGrezzo < PH_MIN || phGrezzo > PH_MAX) {
      errori.push(`Il pH deve essere un numero tra ${PH_MIN} e ${PH_MAX}.`);
    } else {
      ph = Math.round(phGrezzo * 10) / 10;
    }
  }

  const opzionale = (valore, ammessi) => {
    const v = String(valore ?? '').toLowerCase();
    return ammessi.includes(v) ? v : null;
  };

  return {
    provincia,
    tessitura,
    terreno: tessitura?.semplificata ?? null,
    superficieHa,
    irrigazione,
    ph,
    salinita: opzionale(query.salinita, LIVELLI_SALINITA),
    calcare: opzionale(query.calcare, LIVELLI_CALCARE),
    drenaggio: opzionale(query.drenaggio, LIVELLI_DRENAGGIO),
    manodopera: opzionale(query.manodopera, LIVELLI_MANODOPERA),
    orizzonte: opzionale(query.orizzonte, ORIZZONTI),
    comune,
    errori,
  };
}

/** Vista comune a tutte le pagine che mostrano un risultato di calcolo. */
function costruisciRisultato(criteri) {
  const esito = suggerisci(getColture(), criteri);

  const luogo = criteri.comune ? criteri.comune.nome : `provincia di ${criteri.provincia.nome}`;
  const percorso = percorsoRisultato({
    provincia: criteri.provincia.slug,
    terreno: criteri.terreno,
    superficieHa: criteri.superficieHa,
    irrigazione: criteri.irrigazione,
    comune: criteri.comune?.slug,
    ...(criteri.tessitura?.valido
      ? { sabbia: criteri.tessitura.sabbia, limo: criteri.tessitura.limo, argilla: criteri.tessitura.argilla }
      : {}),
    ph: criteri.ph ?? undefined,
    salinita: criteri.salinita ?? undefined,
    calcare: criteri.calcare ?? undefined,
    drenaggio: criteri.drenaggio ?? undefined,
    manodopera: criteri.manodopera ?? undefined,
    orizzonte: criteri.orizzonte ?? undefined,
  });

  return { esito, luogo, percorso, noteTessitura: caratteristicheTessitura(criteri.tessitura) };
}

// ---------------------------------------------------------------- rotte

app.get('/', (req, res) => {
  res.render('home', {
    titolo: 'Cosa coltivare sul tuo terreno in Veneto: calcolatore PLV per ettaro',
    descrizione: SITO.descrizione,
    canonico: urlAssoluto('/'),
    province: getProvince(),
    comuni: getComuni(),
    terreni: TERRENI,
    superficiePredefinita: SUPERFICIE_PREDEFINITA,
    colture: getColture(),
    jsonLd: jsonLdSito(),
  });
});

app.get('/risultato', (req, res) => {
  const criteri = leggiCriteri(req.query);

  if (criteri.errori.length > 0) {
    return res.status(200).render('risultato-non-valido', {
      titolo: 'Parametri non validi | Calcolatore Suolo e Coltura',
      descrizione: 'I parametri della richiesta non sono validi.',
      canonico: urlAssoluto('/'),
      errori: criteri.errori,
      noindex: true,
      jsonLd: null,
    });
  }

  const { esito, luogo, percorso, noteTessitura } = costruisciRisultato(criteri);
  const nomiColture = esito.principali.map((r) => r.coltura.nome).join(', ');

  res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.render('risultato', {
    titolo: `Cosa coltivare su ${formattaEttari(criteri.superficieHa)} di terreno ${criteri.terreno} a ${luogo}`,
    descrizione: `Colture piu adatte a ${formattaEttari(criteri.superficieHa)} di terreno ${criteri.terreno} a ${luogo}${criteri.irrigazione ? ' con irrigazione' : ' in asciutto'}: ${nomiColture}. Margine lordo e PLV per ettaro su rese ISTAT.`,
    canonico: urlAssoluto(percorso),
    criteri,
    esito,
    luogo,
    percorso,
    noteTessitura,
    province: getProvince(),
    comuni: getComuni(),
    terreni: TERRENI,
    zone: getZone(),
    jsonLd: [
      jsonLdRisultato({
        titolo: `Colture consigliate a ${luogo}`,
        descrizione: `Colture compatibili con terreno ${criteri.terreno} a ${luogo}.`,
        percorso,
        colture: esito.principali,
      }),
      jsonLdBriciole([
        { nome: 'Calcolatore', percorso: '/' },
        { nome: `Provincia di ${criteri.provincia.nome}`, percorso: `/cosa-coltivare-in/${criteri.provincia.slug}` },
        { nome: 'Risultato', percorso },
      ]),
    ],
  });
});

// Landing di zona: e la pagina che intercetta "cosa coltivare a <comune>".
app.get('/cosa-coltivare-a/:comune', (req, res, next) => {
  const comune = getComune(req.params.comune.toLowerCase());
  if (!comune) return next();

  const provincia = getProvincia(comune.provincia);
  const criteri = {
    provincia,
    tessitura: profiloDaClasse(comune.terreno_prevalente),
    terreno: comune.terreno_prevalente,
    superficieHa: SUPERFICIE_PREDEFINITA,
    irrigazione: true,
    comune,
  };
  const { esito, percorso, noteTessitura } = costruisciRisultato(criteri);
  const nomiColture = esito.principali.map((r) => r.coltura.nome).join(', ');

  res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.render('zona', {
    titolo: `Cosa coltivare a ${comune.nome}: colture adatte e quanto rendono`,
    descrizione: `Le colture piu adatte ai terreni di ${comune.nome} (${provincia.nome}): ${nomiColture}. Margine lordo e PLV per ettaro su rese ISTAT, con calcolatore sulla tua superficie.`,
    canonico: urlAssoluto(`/cosa-coltivare-a/${comune.slug}`),
    ambito: 'comune',
    comune,
    provincia,
    criteri,
    esito,
    percorso,
    noteTessitura,
    zone: getZone(),
    province: getProvince(),
    comuni: getComuni(),
    terreni: TERRENI,
    altriComuni: getComuniByProvincia(provincia.sigla).filter((c) => c.slug !== comune.slug),
    jsonLd: [
      jsonLdFaqZona({ zona: comune.nome, colture: esito.principali }),
      jsonLdBriciole([
        { nome: 'Calcolatore', percorso: '/' },
        { nome: `Provincia di ${provincia.nome}`, percorso: `/cosa-coltivare-in/${provincia.slug}` },
        { nome: comune.nome, percorso: `/cosa-coltivare-a/${comune.slug}` },
      ]),
    ],
  });
});

app.get('/cosa-coltivare-in/:provincia', (req, res, next) => {
  const provincia = getProvincia(req.params.provincia.toLowerCase());
  if (!provincia) return next();

  const criteri = {
    provincia,
    tessitura: profiloDaClasse(provincia.terreni_prevalenti[0]),
    terreno: provincia.terreni_prevalenti[0],
    superficieHa: SUPERFICIE_PREDEFINITA,
    irrigazione: true,
    comune: null,
  };
  const { esito, percorso, noteTessitura } = costruisciRisultato(criteri);
  const nomiColture = esito.principali.map((r) => r.coltura.nome).join(', ');

  res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.render('zona', {
    titolo: `Cosa coltivare in provincia di ${provincia.nome}: colture e redditivita`,
    descrizione: `Le colture piu adatte in provincia di ${provincia.nome}: ${nomiColture}. Margine lordo e PLV per ettaro su rese ISTAT, con calcolatore sulla tua superficie.`,
    canonico: urlAssoluto(`/cosa-coltivare-in/${provincia.slug}`),
    ambito: 'provincia',
    comune: null,
    provincia,
    criteri,
    esito,
    percorso,
    noteTessitura,
    zone: getZone(),
    province: getProvince(),
    comuni: getComuni(),
    terreni: TERRENI,
    altriComuni: getComuniByProvincia(provincia.sigla),
    jsonLd: [
      jsonLdFaqZona({ zona: `provincia di ${provincia.nome}`, colture: esito.principali }),
      jsonLdBriciole([
        { nome: 'Calcolatore', percorso: '/' },
        { nome: `Provincia di ${provincia.nome}`, percorso: `/cosa-coltivare-in/${provincia.slug}` },
      ]),
    ],
  });
});

app.get('/colture', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.render('colture', {
    titolo: `Le ${getColture().length} colture del Veneto a confronto: margine per ettaro e per ora`,
    descrizione: `Confronto tra ${getColture().length} colture venete: margine lordo per ettaro, margine per ora di lavoro, PLV, terreni adatti e fabbisogno irriguo. Rese da ISTAT.`,
    canonico: urlAssoluto('/colture'),
    colture: getColture().map((c) => ({ coltura: c, plvHa: plvPerEttaro(c) })),
    jsonLd: null,
  });
});

app.get('/colture/:slug', (req, res, next) => {
  const coltura = getColtura(req.params.slug.toLowerCase());
  if (!coltura) return next();

  const plvHa = plvPerEttaro(coltura);
  const province = getProvince().filter((p) => coltura.province.includes(p.sigla));

  res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.render('coltura', {
    titolo: `${coltura.nome} in Veneto: quanto rende, terreni adatti e costi`,
    descrizione: `${coltura.nome}: margine lordo indicativo ${formattaEuro(coltura.margine_lordo_eur_ha)}/ha, PLV ${formattaEuro(plvHa.tipica)}/ha, ${coltura.manodopera_ore_ha} ore di lavoro per ettaro. Terreni, pH, irrigazione e province vocate.`,
    canonico: urlAssoluto(`/colture/${coltura.slug}`),
    coltura,
    plvHa,
    province,
    superficiePredefinita: SUPERFICIE_PREDEFINITA,
    jsonLd: [
      jsonLdColtura(coltura, plvHa, getMeta().colture.generato),
      jsonLdBriciole([
        { nome: 'Calcolatore', percorso: '/' },
        { nome: 'Colture', percorso: '/colture' },
        { nome: coltura.nome, percorso: `/colture/${coltura.slug}` },
      ]),
    ],
  });
});

app.get('/metodologia', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.render('metodologia', {
    titolo: 'Metodologia e fonti dei dati | Calcolatore Suolo e Coltura',
    descrizione: 'Come sono calcolate le stime di PLV: fonti pubbliche utilizzate (ISTAT, ISMEA, CREA RICA, AVEPA), metodo di calcolo del range annata buona/scarsa e limiti dichiarati.',
    canonico: urlAssoluto('/metodologia'),
    meta: getMeta(),
    jsonLd: null,
  });
});

// ------------------------------------------------------ file per i crawler

app.get('/robots.txt', (req, res) => {
  // Le pagine risultato restano accessibili e condivisibili, ma non vanno
  // scansionate a tappeto: la combinatoria dei parametri e enorme e brucerebbe
  // il crawl budget su pagine quasi identiche. Le landing di comune, provincia e
  // coltura sono le pagine su cui vogliamo posizionarci.
  res
    .type('text/plain')
    .send(
      `User-agent: *\nAllow: /\nDisallow: /risultato?\n\nSitemap: ${urlAssoluto('/sitemap.xml')}\n`,
    );
});

app.get('/sitemap.xml', (req, res) => {
  // La data di ultima modifica e quella del dataset: e l'unica cosa che cambia
  // davvero tra un deploy e l'altro, e dichiararla evita che i crawler
  // ripassino su pagine identiche.
  const aggiornato = getMeta().colture.generato;

  const percorsi = [
    { p: '/', priorita: '1.0' },
    { p: '/colture', priorita: '0.9' },
    { p: '/metodologia', priorita: '0.5' },
    ...getProvince().map((x) => ({ p: `/cosa-coltivare-in/${x.slug}`, priorita: '0.9' })),
    ...getColture().map((x) => ({ p: `/colture/${x.slug}`, priorita: '0.8' })),
    ...getComuni().map((x) => ({ p: `/cosa-coltivare-a/${x.slug}`, priorita: '0.7' })),
  ];

  const corpo = percorsi
    .map(
      ({ p, priorita }) =>
        `  <url><loc>${urlAssoluto(p)}</loc><lastmod>${aggiornato}</lastmod><changefreq>monthly</changefreq><priority>${priorita}</priority></url>`,
    )
    .join('\n');

  res.set('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${corpo}\n</urlset>\n`,
  );
});

app.get('/salute', (req, res) => res.json({ ok: true, colture: getColture().length }));

// ------------------------------------------------------------------ errori

app.use((req, res) => {
  res.status(404).render('errore', {
    titolo: 'Pagina non trovata | Calcolatore Suolo e Coltura',
    descrizione: 'La pagina cercata non esiste.',
    canonico: urlAssoluto('/'),
    noindex: true,
    codice: 404,
    messaggio: 'La pagina che cercavi non esiste.',
    jsonLd: null,
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('errore', {
    titolo: 'Errore | Calcolatore Suolo e Coltura',
    descrizione: 'Si e verificato un errore.',
    canonico: urlAssoluto('/'),
    noindex: true,
    codice: 500,
    messaggio: 'Si e verificato un errore inatteso.',
    jsonLd: null,
  });
});

// Questo modulo esporta solo l'app: l'ascolto sulla porta sta in avvio.js.
// Serve perche i test importano `app` e la mettono in ascolto su una porta
// effimera; un `app.listen` qui dentro partirebbe comunque, dato che con gli ESM
// gli import vengono valutati prima di qualunque riga del file che li importa.
export { app, leggiCriteri };

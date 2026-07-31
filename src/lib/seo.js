/**
 * Metadati SEO e dati strutturati.
 *
 * Tutte le pagine sono rese lato server in HTML completo: nessuna idratazione,
 * nessun contenuto che compare dopo il JavaScript. E la ragione principale per
 * cui lo stack e Express + EJS invece di un framework con build step: il
 * contenuto indicizzabile e nel primo byte di risposta.
 */

export const SITO = {
  nome: 'Calcolatore Suolo e Coltura',
  descrizione: 'Scopri quali colture sono piu adatte al tuo terreno in Veneto e quanto puoi ricavarne, con una stima della PLV per ettaro e totale.',
  locale: 'it_IT',
};

/** URL pubblico di base. Su Railway arriva dalle variabili d'ambiente. */
export function baseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

export function urlAssoluto(percorso) {
  return `${baseUrl()}${percorso}`;
}

/**
 * Costruisce il percorso canonico della pagina risultato.
 *
 * I parametri sono normalizzati e messi sempre nello stesso ordine, cosi lo
 * stesso terreno produce sempre la stessa URL: e la condizione perche il link
 * condiviso e la pagina indicizzata siano la stessa risorsa.
 */
export function percorsoRisultato({
  provincia,
  terreno,
  superficieHa,
  irrigazione,
  comune,
  sabbia,
  limo,
  argilla,
  ph,
  salinita,
  calcare,
  drenaggio,
  manodopera,
  orizzonte,
}) {
  const params = new URLSearchParams();
  params.set('provincia', provincia);
  params.set('terreno', terreno);
  params.set('superficie', String(superficieHa));
  params.set('irrigazione', irrigazione ? 'si' : 'no');
  if (comune) params.set('comune', comune);

  // I parametri agronomici facoltativi entrano nella URL solo se l'utente li ha
  // davvero forniti: cosi il caso base produce una sola URL canonica invece di
  // moltiplicarsi in varianti equivalenti che diluirebbero l'indicizzazione.
  if (Number.isFinite(sabbia) && Number.isFinite(limo) && Number.isFinite(argilla)) {
    params.set('sabbia', String(sabbia));
    params.set('limo', String(limo));
    params.set('argilla', String(argilla));
  }
  if (Number.isFinite(ph)) params.set('ph', String(ph));
  if (salinita) params.set('salinita', salinita);
  if (calcare) params.set('calcare', calcare);
  if (drenaggio) params.set('drenaggio', drenaggio);
  if (manodopera) params.set('manodopera', manodopera);
  if (orizzonte) params.set('orizzonte', orizzonte);

  return `/risultato?${params.toString()}`;
}

/**
 * Identita del sito, ripetuta su ogni pagina.
 * Serve a Google per collegare tra loro le pagine come un'unica entita e per
 * abilitare la sitelinks searchbox.
 */
export function jsonLdSito() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITO.nome,
    url: urlAssoluto('/'),
    inLanguage: 'it-IT',
    description: SITO.descrizione,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: urlAssoluto('/colture?q={search_term_string}') },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Briciole di pane.
 * Non sono decorazione: comunicano a Google la gerarchia del sito e fanno
 * comparire il percorso al posto della URL nei risultati di ricerca.
 * @param {{nome:string, percorso:string}[]} voci
 */
export function jsonLdBriciole(voci) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: voci.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: v.nome,
      item: urlAssoluto(v.percorso),
    })),
  };
}

/** Dati strutturati per la pagina risultato: elenco ordinato di colture con stima. */
export function jsonLdRisultato({ titolo, descrizione, percorso, colture }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: titolo,
    description: descrizione,
    url: urlAssoluto(percorso),
    numberOfItems: colture.length,
    itemListElement: colture.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.coltura.nome,
      url: urlAssoluto(`/colture/${r.coltura.slug}`),
    })),
  };
}

/** Dati strutturati per la landing di coltura. */
export function jsonLdColtura(coltura, plvHa, aggiornato) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${coltura.nome} in Veneto: margine per ettaro, terreni e costi`,
    about: {
      '@type': 'Thing',
      name: coltura.nome,
      alternateName: coltura.nome_scientifico,
    },
    url: urlAssoluto(`/colture/${coltura.slug}`),
    mainEntityOfPage: urlAssoluto(`/colture/${coltura.slug}`),
    inLanguage: 'it-IT',
    isAccessibleForFree: true,
    dateModified: aggiornato,
    description: `${coltura.nome}: margine lordo indicativo ${coltura.margine_lordo_eur_ha} euro/ha, PLV ${plvHa.tipica} euro/ha, ${coltura.manodopera_ore_ha} ore/ha di lavoro. Terreni adatti: ${coltura.terreni.join(', ')}.`,
    publisher: { '@type': 'Organization', name: SITO.nome, url: urlAssoluto('/') },
  };
}

/** FAQPage per le landing di zona: intercetta le ricerche in forma di domanda. */
export function jsonLdFaqZona({ zona, colture }) {
  const elenco = colture.map((r) => r.coltura.nome).join(', ');
  const migliore = colture[0];
  const perOra = [...colture].sort((a, b) => (b.coltura.margine_eur_ora ?? 0) - (a.coltura.margine_eur_ora ?? 0))[0];

  const domande = [
    {
      '@type': 'Question',
      name: `Cosa coltivare a ${zona}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Le colture piu adatte ai terreni di ${zona} sono: ${elenco}. La scelta dipende dalla tessitura del terreno, dal pH, dalla disponibilita di irrigazione, dalla superficie e dalla manodopera disponibile.`,
      },
    },
  ];

  if (migliore) {
    domande.push({
      '@type': 'Question',
      name: `Quanto rende un ettaro di terreno a ${zona}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Secondo le rese ISTAT per il Veneto, a ${zona} il ${migliore.coltura.nome.toLowerCase()} produce una PLV indicativa di ${migliore.plvHa.tipica} euro per ettaro in annata tipica, con un margine lordo di circa ${migliore.margineHa} euro per ettaro una volta dedotti i costi di produzione. La PLV non e il reddito: non include i costi ne i contributi PAC.`,
      },
    });
  }

  if (perOra) {
    domande.push({
      '@type': 'Question',
      name: `Qual e la coltura piu redditizia a ${zona} per chi ha poca manodopera?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Tra le colture adatte a ${zona}, il ${perOra.coltura.nome.toLowerCase()} offre il miglior margine per ora di lavoro: circa ${perOra.coltura.margine_eur_ora} euro all'ora, con ${perOra.coltura.manodopera_ore_ha} ore per ettaro. Il margine per ettaro e il margine per ora danno spesso classifiche diverse.`,
      },
    });
  }

  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: domande };
}

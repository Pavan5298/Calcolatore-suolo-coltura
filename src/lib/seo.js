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
export function percorsoRisultato({ provincia, terreno, superficieHa, irrigazione, comune }) {
  const params = new URLSearchParams();
  params.set('provincia', provincia);
  params.set('terreno', terreno);
  params.set('superficie', String(superficieHa));
  params.set('irrigazione', irrigazione ? 'si' : 'no');
  if (comune) params.set('comune', comune);
  return `/risultato?${params.toString()}`;
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
export function jsonLdColtura(coltura, plvHa) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${coltura.nome} in Veneto: PLV per ettaro e requisiti del terreno`,
    about: {
      '@type': 'Thing',
      name: coltura.nome,
      alternateName: coltura.nome_scientifico,
    },
    url: urlAssoluto(`/colture/${coltura.slug}`),
    inLanguage: 'it',
    isAccessibleForFree: true,
    description: `PLV indicativa ${plvHa.tipica} euro/ha in annata tipica. Terreni adatti: ${coltura.terreni.join(', ')}.`,
  };
}

/** FAQPage per le landing di zona: intercetta le ricerche in forma di domanda. */
export function jsonLdFaqZona({ zona, colture }) {
  const elenco = colture.map((r) => r.coltura.nome).join(', ');
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `Cosa coltivare a ${zona}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Le colture piu adatte ai terreni di ${zona} secondo il nostro modello sono: ${elenco}. La scelta dipende dalla tessitura del terreno, dalla disponibilita di irrigazione e dalla superficie.`,
        },
      },
    ],
  };
}

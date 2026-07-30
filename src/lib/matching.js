/**
 * Motore di compatibilita colture / terreno.
 *
 * Due passaggi distinti, tenuti separati di proposito:
 *
 *  1. filtri rigidi - vincoli agronomici che rendono la coltura non proponibile
 *     (fascia altimetrica, tessitura incompatibile, irrigazione indispensabile
 *     assente, superficie minima). Questi escludono.
 *  2. punteggio - quanto la coltura e *adatta* tra quelle proponibili. Non e una
 *     verita agronomica, e un ordinamento: pesa la vocazione del terreno, la
 *     diffusione effettiva in provincia, l'uso coerente dell'irrigazione e
 *     l'affidabilita del dato.
 *
 * Le colture di nicchia vengono restituite in un elenco separato invece di
 * competere con i seminativi: hanno diffusione prossima a zero e dati
 * sperimentali, quindi in un ranking unico finirebbero sempre in fondo o, se
 * forzate in alto, falserebbero il suggerimento. Separarle permette di mostrarle
 * senza mentire sul loro peso.
 */

import { plvPerEttaro, plvTotale, superficieInvestibile } from './plv.js';

export const CATEGORIA_NICCHIA = 'colture di nicchia';
export const MIN_RISULTATI = 3;
export const MAX_RISULTATI = 5;

const PESI = {
  terrenoOttimale: 30,
  terrenoCompatibile: 12,
  diffusione: 25,
  irrigazioneSfruttata: 10,
  irrigazioneNonServe: 10,
  irrigazioneConsigliataAssente: -8,
  oltreScalaMassima: -5,
  poliennale: -5,
  affidabilita: { istat: 6, stima_esperto: 0, sperimentale: -12 },
};

/**
 * @typedef {object} Criteri
 * @property {object} provincia oggetto provincia (da getProvincia)
 * @property {string} terreno argilloso | sabbioso | limoso | misto
 * @property {number} superficieHa
 * @property {boolean} irrigazione
 */

/**
 * Valuta una singola coltura contro i criteri.
 * @returns {{coltura:object, ammessa:boolean, esclusioni:string[], punteggio:number, motivi:string[], avvertenze:string[]}}
 */
export function valuta(coltura, criteri) {
  const { provincia, terreno, superficieHa, irrigazione } = criteri;
  const esclusioni = [];
  const motivi = [];
  const avvertenze = [];
  let punteggio = 0;

  // --- 1. filtri rigidi ---

  const altimetriaCompatibile = coltura.altimetria.some((a) => provincia.altimetria.includes(a));
  if (!altimetriaCompatibile) {
    esclusioni.push(`fascia altimetrica non compatibile con la provincia di ${provincia.nome}`);
  }

  if (!coltura.province.includes(provincia.sigla)) {
    esclusioni.push(`non presente nei comprensori della provincia di ${provincia.nome}`);
  }

  const terrenoCompatibile = coltura.terreni.includes(terreno);
  if (!terrenoCompatibile) {
    esclusioni.push(`non adatta a terreno ${terreno}`);
  }

  if (coltura.irrigazione === 'necessaria' && !irrigazione) {
    esclusioni.push('richiede irrigazione, non disponibile');
  }

  if (superficieHa < coltura.superficie_min_ha) {
    esclusioni.push(`superficie minima indicativa ${coltura.superficie_min_ha} ha`);
  }

  // --- 2. punteggio ---

  if (coltura.terreni_ottimali.includes(terreno)) {
    punteggio += PESI.terrenoOttimale;
    motivi.push(`terreno ${terreno}: vocazione ottimale`);
  } else if (terrenoCompatibile) {
    punteggio += PESI.terrenoCompatibile;
    motivi.push(`terreno ${terreno}: compatibile`);
  }

  punteggio += (coltura.diffusione ?? 0) * PESI.diffusione;
  if ((coltura.diffusione ?? 0) >= 0.6) {
    motivi.push(`coltura molto diffusa in provincia di ${provincia.nome}`);
  }

  if (irrigazione && (coltura.irrigazione === 'necessaria' || coltura.irrigazione === 'consigliata')) {
    punteggio += PESI.irrigazioneSfruttata;
    motivi.push('valorizza la disponibilita irrigua');
  } else if (!irrigazione && coltura.irrigazione === 'non_necessaria') {
    punteggio += PESI.irrigazioneNonServe;
    motivi.push('non richiede irrigazione');
  } else if (!irrigazione && coltura.irrigazione === 'consigliata') {
    punteggio += PESI.irrigazioneConsigliataAssente;
    avvertenze.push('In asciutto la resa e piu variabile e il divario tra annata buona e scarsa si allarga rispetto al range indicato.');
  }

  const investibile = superficieInvestibile(coltura, superficieHa);
  if (investibile < superficieHa) {
    punteggio += PESI.oltreScalaMassima;
    avvertenze.push(
      `Coltura che non scala su grandi superfici: la stima e calcolata su ${investibile} ha dei ${superficieHa} ha inseriti.`,
    );
  }

  if (coltura.ciclo === 'poliennale') {
    punteggio += PESI.poliennale;
    avvertenze.push('Coltura poliennale: richiede un investimento d\'impianto e piu anni prima della piena produzione.');
  }

  punteggio += PESI.affidabilita[coltura.affidabilita] ?? 0;

  avvertenze.push(...(coltura.avvertenze ?? []));

  return {
    coltura,
    ammessa: esclusioni.length === 0,
    esclusioni,
    punteggio: Math.round(punteggio * 10) / 10,
    motivi,
    avvertenze,
  };
}

/** Arricchisce una valutazione con i numeri di PLV. */
function conPlv(valutazione, superficieHa) {
  const { coltura } = valutazione;
  const superficie = superficieInvestibile(coltura, superficieHa);
  const perEttaro = plvPerEttaro(coltura);

  return {
    ...valutazione,
    superficieConsiderataHa: superficie,
    plvHa: perEttaro,
    plvTotale: plvTotale(perEttaro, superficie),
  };
}

/**
 * Suggerisce le colture per un terreno.
 *
 * @param {object[]} colture
 * @param {Criteri} criteri
 * @returns {{principali:object[], nicchia:object[], conRiserva:boolean}}
 */
export function suggerisci(colture, criteri) {
  const valutate = colture.map((c) => valuta(c, criteri));
  const ordina = (a, b) => b.punteggio - a.punteggio || a.coltura.nome.localeCompare(b.coltura.nome, 'it');

  const isNicchia = (v) => v.coltura.categoria === CATEGORIA_NICCHIA;

  const ammesse = valutate.filter((v) => v.ammessa);
  let principali = ammesse.filter((v) => !isNicchia(v)).sort(ordina);
  const nicchia = ammesse.filter(isNicchia).sort(ordina);
  let conRiserva = false;

  // Il requisito e restituire almeno 3 colture. Se i vincoli rigidi ne lasciano
  // meno, si allenta il solo vincolo di tessitura - agronomicamente il piu
  // sfumato dei quattro - segnalandolo all'utente invece di nasconderlo.
  if (principali.length < MIN_RISULTATI) {
    const ripescate = valutate
      .filter((v) => !v.ammessa && !isNicchia(v))
      .filter((v) => v.esclusioni.length === 1 && v.esclusioni[0].startsWith('non adatta a terreno'))
      .sort(ordina)
      .map((v) => ({
        ...v,
        conRiserva: true,
        avvertenze: [
          `Tessitura ${criteri.terreno} non ideale per questa coltura: verificare drenaggio e lavorabilita con un agronomo prima di procedere.`,
          ...v.avvertenze,
        ],
      }));

    if (ripescate.length > 0) {
      conRiserva = true;
      principali = [...principali, ...ripescate].slice(0, MAX_RISULTATI);
    }
  }

  return {
    principali: principali.slice(0, MAX_RISULTATI).map((v) => conPlv(v, criteri.superficieHa)),
    nicchia: nicchia.map((v) => conPlv(v, criteri.superficieHa)),
    conRiserva,
  };
}

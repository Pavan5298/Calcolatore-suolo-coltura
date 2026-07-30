/**
 * Motore di compatibilita colture / terreno.
 *
 * Due passaggi distinti, tenuti separati di proposito:
 *
 *  1. filtri rigidi - vincoli che rendono la coltura non proponibile su quel
 *     terreno (fascia altimetrica, tessitura, pH fuori dall'intervallo di
 *     tolleranza, salinita, irrigazione indispensabile assente, superficie
 *     minima). Questi escludono.
 *  2. punteggio - quanto la coltura e *adatta* tra quelle proponibili: vocazione
 *     della tessitura, pH nell'ottimale, diffusione effettiva in Veneto, uso
 *     coerente dell'irrigazione, affidabilita del dato.
 *
 * I parametri agronomici facoltativi (pH, salinita, calcare, drenaggio) entrano
 * nel calcolo solo se l'utente li fornisce: assenti, non penalizzano nessuno.
 * Questo e voluto - meglio un consiglio piu generico che uno costruito su
 * assunzioni non dichiarate.
 *
 * Le colture di nicchia vengono restituite in un elenco separato invece di
 * competere con i seminativi: hanno diffusione prossima a zero e dati
 * sperimentali, quindi in un ranking unico finirebbero sempre in fondo o, se
 * forzate in alto, falserebbero il suggerimento.
 */

import { plvPerEttaro, plvTotale, superficieInvestibile } from './plv.js';

export const CATEGORIA_NICCHIA = 'colture di nicchia';
export const MIN_RISULTATI = 3;
export const MAX_RISULTATI = 5;

export const LIVELLI_SALINITA = Object.freeze(['assente', 'moderata', 'elevata']);
export const LIVELLI_CALCARE = Object.freeze(['basso', 'medio', 'elevato']);
export const LIVELLI_DRENAGGIO = Object.freeze(['buono', 'medio', 'lento']);

const PESI = {
  terrenoOttimale: 30,
  terrenoCompatibile: 12,
  diffusione: 25,
  phOttimale: 12,
  phTollerato: -6,
  irrigazioneSfruttata: 10,
  irrigazioneNonServe: 10,
  irrigazioneConsigliataAssente: -8,
  salinitaModerataMalTollerata: -14,
  calcareRischioClorosi: -12,
  drenaggioInsufficiente: -18,
  oltreScalaMassima: -5,
  poliennale: -5,
  affidabilita: { istat: 8, istat_resa: 6, stima_esperto: 0, sperimentale: -12 },
};

/**
 * @typedef {object} Criteri
 * @property {object} provincia oggetto provincia (da getProvincia)
 * @property {object} tessitura esito di analizzaTessitura o profiloDaClasse
 * @property {number} superficieHa
 * @property {boolean} irrigazione
 * @property {number|null} [ph]
 * @property {string|null} [salinita] assente | moderata | elevata
 * @property {string|null} [calcare] basso | medio | elevato
 * @property {string|null} [drenaggio] buono | medio | lento
 */

/**
 * Valuta una singola coltura contro i criteri.
 * @returns {{coltura:object, ammessa:boolean, esclusioni:string[], punteggio:number, motivi:string[], avvertenze:string[]}}
 */
export function valuta(coltura, criteri) {
  const { provincia, superficieHa, irrigazione } = criteri;
  const terreno = criteri.tessitura?.semplificata ?? criteri.terreno;
  const { ph = null, salinita = null, calcare = null, drenaggio = null } = criteri;

  const esclusioni = [];
  const motivi = [];
  const avvertenze = [];
  let punteggio = 0;

  // ------------------------------------------------------- 1. filtri rigidi

  if (!coltura.altimetria.some((a) => provincia.altimetria.includes(a))) {
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

  if (Number.isFinite(ph) && coltura.ph) {
    if (ph < coltura.ph.minimo) {
      esclusioni.push(`pH ${ph} sotto il minimo tollerato (${coltura.ph.minimo})`);
    } else if (ph > coltura.ph.massimo) {
      esclusioni.push(`pH ${ph} sopra il massimo tollerato (${coltura.ph.massimo})`);
    }
  }

  if (salinita === 'elevata' && coltura.tolleranza_salinita === 'bassa') {
    esclusioni.push('salinita elevata incompatibile con una coltura poco tollerante');
  }

  // Su una poliennale il ristagno e discriminante: un impianto arboreo su suolo
  // asfittico non si recupera, mentre su una annuale si puo intervenire con la
  // sistemazione idraulica prima della semina successiva.
  if (drenaggio === 'lento' && coltura.drenaggio_richiesto === 'buono' && coltura.ciclo === 'poliennale') {
    esclusioni.push('drenaggio lento incompatibile con un impianto poliennale che richiede suolo ben drenato');
  }

  // ----------------------------------------------------------- 2. punteggio

  if (coltura.terreni_ottimali.includes(terreno)) {
    punteggio += PESI.terrenoOttimale;
    motivi.push(`terreno ${terreno}: vocazione ottimale`);
  } else if (terrenoCompatibile) {
    punteggio += PESI.terrenoCompatibile;
    motivi.push(`terreno ${terreno}: compatibile`);
  }

  punteggio += (coltura.diffusione ?? 0) * PESI.diffusione;
  if ((coltura.diffusione ?? 0) >= 0.75) {
    motivi.push('coltura molto diffusa in Veneto');
  }

  if (Number.isFinite(ph) && coltura.ph) {
    if (ph >= coltura.ph.ottimale_min && ph <= coltura.ph.ottimale_max) {
      punteggio += PESI.phOttimale;
      motivi.push(`pH ${ph}: nell'intervallo ottimale`);
    } else if (ph >= coltura.ph.minimo && ph <= coltura.ph.massimo) {
      punteggio += PESI.phTollerato;
      avvertenze.push(
        `pH ${ph} tollerato ma fuori dall'ottimale (${coltura.ph.ottimale_min}-${coltura.ph.ottimale_max}): attendersi resa inferiore e possibili carenze nutrizionali.`,
      );
    }
  }

  if (irrigazione && (coltura.irrigazione === 'necessaria' || coltura.irrigazione === 'consigliata')) {
    punteggio += PESI.irrigazioneSfruttata;
    motivi.push('valorizza la disponibilita irrigua');
  } else if (!irrigazione && coltura.irrigazione === 'non_necessaria') {
    punteggio += PESI.irrigazioneNonServe;
    motivi.push('non richiede irrigazione');
  } else if (!irrigazione && coltura.irrigazione === 'consigliata') {
    punteggio += PESI.irrigazioneConsigliataAssente;
    avvertenze.push(
      'In asciutto la resa e piu variabile e il divario tra annata buona e scarsa si allarga rispetto al range indicato.',
    );
  }

  if (salinita === 'moderata' && coltura.tolleranza_salinita === 'bassa') {
    punteggio += PESI.salinitaModerataMalTollerata;
    avvertenze.push(
      'Coltura poco tollerante alla salinita su terreno moderatamente salso: attendersi perdite di resa e germinabilita irregolare.',
    );
  } else if (salinita === 'elevata' && coltura.tolleranza_salinita === 'media') {
    punteggio += PESI.salinitaModerataMalTollerata;
    avvertenze.push('Salinita elevata al limite della tolleranza di questa coltura: verificare con analisi della falda.');
  } else if ((salinita === 'moderata' || salinita === 'elevata') && coltura.tolleranza_salinita === 'alta') {
    motivi.push('buona tolleranza alla salinita');
  }

  if (calcare === 'elevato' && coltura.sensibilita_calcare === 'alta') {
    punteggio += PESI.calcareRischioClorosi;
    avvertenze.push(
      'Calcare elevato con coltura sensibile: rischio concreto di clorosi ferrica. Sulle arboree la scelta del portinnesto diventa determinante.',
    );
  }

  if (drenaggio === 'lento' && coltura.drenaggio_richiesto === 'buono' && coltura.ciclo !== 'poliennale') {
    punteggio += PESI.drenaggioInsufficiente;
    avvertenze.push('Drenaggio lento su coltura che richiede suolo ben drenato: intervenire sulla sistemazione idraulica prima della semina.');
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
    avvertenze.push(
      "Coltura poliennale: richiede un investimento d'impianto e piu anni prima della piena produzione.",
    );
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
 * @returns {{principali:object[], nicchia:object[], conRiserva:boolean, ammesse:number}}
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
  // sfumato - segnalandolo all'utente invece di nasconderlo.
  if (principali.length < MIN_RISULTATI) {
    const ripescate = valutate
      .filter((v) => !v.ammessa && !isNicchia(v))
      .filter((v) => v.esclusioni.length === 1 && v.esclusioni[0].startsWith('non adatta a terreno'))
      .sort(ordina)
      .map((v) => ({
        ...v,
        conRiserva: true,
        avvertenze: [
          `Tessitura ${criteri.tessitura?.semplificata ?? criteri.terreno} non ideale per questa coltura: verificare drenaggio e lavorabilita con un agronomo prima di procedere.`,
          ...v.avvertenze,
        ],
      }));

    if (ripescate.length > 0) {
      conRiserva = true;
      principali = [...principali, ...ripescate].slice(0, MAX_RISULTATI);
    }
  }

  const selezionate = principali.slice(0, MAX_RISULTATI);

  return {
    principali: selezionate.map((v) => conPlv(v, criteri.superficieHa)),
    nicchia: nicchia.map((v) => conPlv(v, criteri.superficieHa)),
    conRiserva,
    ammesse: ammesse.length,
    // Con i vincoli agronomici stretti (pH estremo, salinita elevata) puo non
    // esserci una terza coltura proponibile. Si dichiara invece di riempire
    // l'elenco con colture che su quel terreno non starebbero in piedi:
    // un consiglio inventato e peggio di un consiglio corto.
    sottoSoglia: selezionate.length < MIN_RISULTATI,
  };
}

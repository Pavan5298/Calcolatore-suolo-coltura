/**
 * Motore di compatibilita colture / terreno.
 *
 * A COSA SERVE IL PUNTEGGIO
 *
 * Non a dire quale coltura e "la migliore" in astratto, ma quale rappresenta la
 * migliore opportunita su quel terreno per chi deve decidere cosa seminare.
 * La distinzione conta: una prima versione di questo motore pesava soprattutto
 * la DIFFUSIONE della coltura, e il risultato era un calcolatore che consigliava
 * a tutti di continuare a fare mais e soia - cioe esattamente quello che gia
 * facevano. Il pomodoro da industria, con una PLV quattro volte superiore alla
 * soia, non compariva mai.
 *
 * Il termine dominante e ora il MARGINE LORDO (PLV meno costi), non la PLV e
 * non la diffusione. La diffusione resta, con peso molto ridotto, come segnale
 * di accesso al mercato: una coltura molto praticata in Veneto ha filiere,
 * contoterzisti e acquirenti gia disponibili, e questo per un'impresa vale.
 *
 * Il margine per ettaro pero non basta da solo, e pesarlo da solo ribalta il
 * problema invece di risolverlo: in cima finiscono fragola e peperone, che su
 * venti ettari nessuna azienda riesce a gestire. Il secondo termine economico e
 * quindi il MARGINE PER ORA DI LAVORO, che riporta in gioco le colture
 * meccanizzabili. Insieme dicono la cosa giusta: quanto rende un ettaro e
 * quanto rende un'ora, e la scelta imprenditoriale sta nel mezzo.
 *
 * CONFIDENZA STATISTICA
 *
 * Il terzo elemento e meno ovvio ma altrettanto necessario. Una resa ISTAT
 * calcolata su 23 ettari regionali e rumore; la stessa su 140.000 ettari e un
 * dato solido. Trattarle uguali fa emergere in cima colture marginali il cui
 * margine apparente e solo un artefatto di un campione minuscolo.
 *
 * La superficie regionale diventa quindi un FATTORE DI CONFIDENZA che moltiplica
 * i termini economici - non una penalita additiva, perche il punto non e che
 * quella coltura valga meno, e che di quel numero ci si puo fidare meno. Sotto
 * una soglia la fragilita del dato viene anche dichiarata all'utente.
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

export const MIN_RISULTATI = 3;

/**
 * Quante colture mostrare in dettaglio.
 *
 * Il requisito iniziale era 3-5. Con 80 colture in dataset e un obiettivo di
 * guida alla scelta imprenditoriale, cinque schede nascondono il ventaglio delle
 * opzioni invece di illustrarlo: il pomodoro da industria puo essere settimo per
 * punteggio e restare comunque la scelta giusta per chi ha terra e non ore. Le
 * schede in dettaglio salgono quindi a otto, e tutte le altre colture ammesse
 * restano visibili nella tabella di confronto.
 */
export const MAX_RISULTATI = 8;

export const LIVELLI_SALINITA = Object.freeze(['assente', 'moderata', 'elevata']);
export const LIVELLI_CALCARE = Object.freeze(['basso', 'medio', 'elevato']);
export const LIVELLI_DRENAGGIO = Object.freeze(['buono', 'medio', 'lento']);
export const LIVELLI_MANODOPERA = Object.freeze(['limitata', 'familiare', 'stagionali']);
export const ORIZZONTI = Object.freeze(['annuale', 'pluriennale']);

/** Ore/ha sostenibili per livello di manodopera dichiarato. */
const SOGLIE_MANODOPERA = { limitata: 40, familiare: 200, stagionali: Infinity };

/** Margine lordo (euro/ha) oltre il quale il punteggio economico satura. */
const MARGINE_RIFERIMENTO = 6000;

/** Margine orario (euro/h) oltre il quale il punteggio di efficienza satura. */
const MARGINE_ORARIO_RIFERIMENTO = 60;

/** Superficie regionale (ha) oltre la quale la resa ISTAT si considera solida. */
const SUPERFICIE_PIENA_CONFIDENZA = 2000;

/** Sotto questa superficie regionale il dato viene dichiarato fragile. */
const SUPERFICIE_DATO_FRAGILE = 300;

/** Peso minimo: nemmeno il campione piu piccolo azzera del tutto il segnale. */
const CONFIDENZA_MINIMA = 0.45;

/**
 * Quanto ci si puo fidare della resa ISTAT di una coltura, in base alla
 * superficie su cui e stata rilevata. Scala logaritmica: la differenza tra 20 e
 * 200 ettari conta molto piu di quella tra 20.000 e 200.000.
 */
function confidenzaStatistica(superficieHa) {
  if (!Number.isFinite(superficieHa) || superficieHa <= 0) return CONFIDENZA_MINIMA;
  const grezza = Math.log10(superficieHa + 1) / Math.log10(SUPERFICIE_PIENA_CONFIDENZA);
  return Math.max(CONFIDENZA_MINIMA, Math.min(1, grezza));
}

const PESI = {
  margine: 22,
  margineOrario: 16,
  terrenoOttimale: 25,
  terrenoCompatibile: 10,
  // Ridotta da 25 a 10: era il termine dominante e faceva vincere sempre le
  // commodity. Ora e un segnale di accesso al mercato, non un premio al conformismo.
  diffusione: 10,
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
  margineNegativo: -25,
  manodoperaAlLimite: -10,
  contrattoRichiesto: -4,
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
  const {
    ph = null, salinita = null, calcare = null, drenaggio = null,
    manodopera = null, orizzonte = null,
  } = criteri;

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

  if (manodopera && coltura.manodopera_ore_ha > (SOGLIE_MANODOPERA[manodopera] ?? Infinity)) {
    esclusioni.push(
      `richiede ${coltura.manodopera_ore_ha} ore/ha di lavoro, oltre quello che una manodopera ${manodopera} puo sostenere`,
    );
  }

  if (orizzonte === 'annuale' && coltura.ciclo === 'poliennale') {
    esclusioni.push("impianto poliennale escluso da un orizzonte di investimento annuale");
  }

  // Su una poliennale il ristagno e discriminante: un impianto arboreo su suolo
  // asfittico non si recupera, mentre su una annuale si puo intervenire con la
  // sistemazione idraulica prima della semina successiva.
  if (drenaggio === 'lento' && coltura.drenaggio_richiesto === 'buono' && coltura.ciclo === 'poliennale') {
    esclusioni.push('drenaggio lento incompatibile con un impianto poliennale che richiede suolo ben drenato');
  }

  // ----------------------------------------------------------- 2. punteggio

  // Termine economico, dominante. Radice quadrata invece che lineare: la
  // differenza tra 500 e 2.000 euro/ha di margine conta molto piu della
  // differenza tra 20.000 e 25.000, dove entrano in gioco vincoli (manodopera,
  // capitale, mercato) che il punteggio non puo catturare.
  const margine = coltura.margine_lordo_eur_ha ?? 0;
  const margineOrario = coltura.margine_eur_ora ?? 0;
  const superficieVeneto = coltura.superficie_veneto_ha ?? 0;
  const confidenza = confidenzaStatistica(superficieVeneto);

  if (superficieVeneto > 0 && superficieVeneto < SUPERFICIE_DATO_FRAGILE) {
    avvertenze.push(
      `In Veneto se ne coltivano ${Math.round(superficieVeneto)} ha in tutto: la resa media ISTAT su una superficie cosi piccola e statisticamente fragile, e con essa la stima di margine. Da verificare su dati aziendali prima di decidere.`,
    );
  }

  if (margine > 0) {
    punteggio += confidenza * PESI.margine * Math.min(1, Math.sqrt(margine / MARGINE_RIFERIMENTO));
    punteggio +=
      confidenza * PESI.margineOrario * Math.min(1, Math.sqrt(Math.max(0, margineOrario) / MARGINE_ORARIO_RIFERIMENTO));

    if (margine >= 3000) {
      motivi.push(`margine lordo indicativo ${Math.round(margine).toLocaleString('it-IT')} €/ha`);
    }
    if (margineOrario >= 45) {
      motivi.push(`buona resa del lavoro: ${margineOrario} €/ora`);
    }
  } else {
    punteggio += PESI.margineNegativo;
    avvertenze.push(
      'Ai prezzi e ai costi indicativi usati, questa coltura non copre i costi di produzione: valutabile solo con rese superiori alla media o con un canale di vendita che spunti prezzi migliori.',
    );
  }

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
    const investimento = coltura.investimento_impianto_eur_ha;
    const anni = coltura.anni_alla_produzione;
    avvertenze.push(
      investimento
        ? `Impianto poliennale: investimento indicativo ${investimento.toLocaleString('it-IT')} €/ha e ${anni} anni prima della piena produzione. Il margine annuo non e confrontabile con quello di un seminativo finche l'impianto non e ammortizzato.`
        : "Coltura poliennale: richiede un investimento d'impianto e piu anni prima della piena produzione.",
    );
  }

  if (coltura.contratto_filiera) {
    punteggio += PESI.contrattoRichiesto;
    avvertenze.push(
      'Coltura da contratto: senza un accordo di filiera a monte il prodotto non ha sbocco commerciale. Va verificato prima della semina, non dopo.',
    );
  }

  // Segnalare che si sta usando quasi tutta la manodopera disponibile e piu
  // utile che escludere: e una scelta imprenditoriale, non un vincolo agronomico.
  if (manodopera && SOGLIE_MANODOPERA[manodopera] !== Infinity) {
    const soglia = SOGLIE_MANODOPERA[manodopera];
    if (coltura.manodopera_ore_ha > soglia * 0.7) {
      punteggio += PESI.manodoperaAlLimite;
      avvertenze.push(
        `Assorbe ${coltura.manodopera_ore_ha} ore/ha: al limite della manodopera dichiarata. Su superfici estese il lavoro diventa il vincolo prima della terra.`,
      );
    }
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

  const margineHa = coltura.margine_lordo_eur_ha ?? 0;

  return {
    ...valutazione,
    superficieConsiderataHa: superficie,
    plvHa: perEttaro,
    plvTotale: plvTotale(perEttaro, superficie),
    margineHa,
    margineTotale: Math.round(margineHa * superficie),
    costiTotale: Math.round((coltura.costi_eur_ha ?? 0) * superficie),
    oreTotali: Math.round((coltura.manodopera_ore_ha ?? 0) * superficie),
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

  const ammesse = valutate.filter((v) => v.ammessa);
  let principali = ammesse.sort(ordina);
  let conRiserva = false;

  // Il requisito e restituire almeno 3 colture. Se i vincoli rigidi ne lasciano
  // meno, si allenta il solo vincolo di tessitura - agronomicamente il piu
  // sfumato - segnalandolo all'utente invece di nasconderlo.
  if (principali.length < MIN_RISULTATI) {
    const ripescate = valutate
      .filter((v) => !v.ammessa)
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
  const restanti = principali.slice(MAX_RISULTATI);

  return {
    principali: selezionate.map((v) => conPlv(v, criteri.superficieHa)),
    // Il resto del ventaglio, in forma compatta: serve a far vedere che la
    // scelta non si esaurisce nelle prime otto e a rendere confrontabili i due
    // numeri che contano davvero, margine per ettaro e margine per ora.
    alternative: restanti.map((v) => conPlv(v, criteri.superficieHa)),
    conRiserva,
    ammesse: ammesse.length,
    // Con i vincoli agronomici stretti (pH estremo, salinita elevata) puo non
    // esserci una terza coltura proponibile. Si dichiara invece di riempire
    // l'elenco con colture che su quel terreno non starebbero in piedi:
    // un consiglio inventato e peggio di un consiglio corto.
    sottoSoglia: selezionate.length < MIN_RISULTATI,
  };
}

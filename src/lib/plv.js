/**
 * Calcolo della PLV (Produzione Lorda Vendibile).
 *
 * PLV (euro/ha) = resa (q/ha) x prezzo (euro/q). La PAC non e inclusa: i
 * pagamenti diretti non fanno parte della PLV e vanno tenuti separati.
 *
 * IL RANGE ANNATA BUONA / ANNATA SCARSA
 *
 * Il modo intuitivo di ricavarlo e sbagliato:
 *
 *     PLV_scarsa = resa_p20 x prezzo_p20
 *     PLV_buona  = resa_p80 x prezzo_p80
 *
 * Resa e prezzo sono negativamente correlati: l'annata siccitosa che dimezza la
 * resa e la stessa che fa salire il prezzo. Moltiplicare i due percentili
 * peggiori tra loro descrive uno scenario mai verificatosi e produce un range
 * assurdamente largo.
 *
 * Questo modulo usa tre metodi, in ordine di preferenza:
 *
 *   1. PERCENTILI SULLA SERIE ANNUALE (corretto). Si calcola la PLV di ogni
 *      singolo anno e si prendono i percentili di quella serie: la correlazione
 *      e gia dentro i dati. Richiede almeno 5 anni.
 *
 *   2. COEFFICIENTE DI VARIABILITA sulla PLV (ripiego onesto). Con una serie
 *      troppo corta - oggi l'export ISTAT copre due sole annate - il range si
 *      costruisce applicando un coefficiente dichiarato *alla PLV*, non
 *      separatamente a resa e prezzo. Applicandolo al prodotto anziche ai due
 *      fattori si evita per costruzione l'errore di correlazione.
 *
 *   3. RANGE CURATO a mano, per le colture senza rilevazione statistica.
 *
 * Il metodo effettivamente usato viene sempre dichiarato all'utente.
 */

export const PERCENTILE_SCARSA = 20;
export const PERCENTILE_TIPICA = 50;
export const PERCENTILE_BUONA = 80;
export const ANNI_MINIMI_PER_PERCENTILI = 5;

/**
 * Percentile con interpolazione lineare sui valori ordinati.
 * @param {number[]} valori
 * @param {number} p percentile da 0 a 100
 */
export function percentile(valori, p) {
  if (!Array.isArray(valori) || valori.length === 0) return null;
  const ordinati = [...valori].sort((a, b) => a - b);
  if (ordinati.length === 1) return ordinati[0];

  const posizione = ((ordinati.length - 1) * p) / 100;
  const inferiore = Math.floor(posizione);
  const superiore = Math.ceil(posizione);
  if (inferiore === superiore) return ordinati[inferiore];

  const peso = posizione - inferiore;
  return ordinati[inferiore] * (1 - peso) + ordinati[superiore] * peso;
}

/**
 * PLV per ettaro di una coltura.
 *
 * @param {object} coltura
 * @returns {{scarsa:number, tipica:number, buona:number, metodo:string, anni:number|null}}
 */
export function plvPerEttaro(coltura) {
  const serie = coltura.serie_annuale;

  // --- metodo 1: percentili sulla serie di PLV annuali ---
  if (Array.isArray(serie) && serie.length >= ANNI_MINIMI_PER_PERCENTILI) {
    const plvAnnuali = serie
      .filter((a) => Number.isFinite(a.resa_q_ha) && Number.isFinite(a.prezzo_eur_q))
      .map((a) => a.resa_q_ha * a.prezzo_eur_q);

    if (plvAnnuali.length >= ANNI_MINIMI_PER_PERCENTILI) {
      return {
        scarsa: Math.round(percentile(plvAnnuali, PERCENTILE_SCARSA)),
        tipica: Math.round(percentile(plvAnnuali, PERCENTILE_TIPICA)),
        buona: Math.round(percentile(plvAnnuali, PERCENTILE_BUONA)),
        metodo: `percentili su serie annuale di ${plvAnnuali.length} anni`,
        anni: plvAnnuali.length,
      };
    }
  }

  // --- metodo 2 e 3: coefficiente di variabilita applicato alla PLV ---
  const resa = coltura.resa_q_ha?.tipica;
  const prezzo = coltura.prezzo_eur_q?.tipico;

  if (Number.isFinite(resa) && Number.isFinite(prezzo)) {
    const variabilita = coltura.variabilita_plv ?? 0.3;
    const tipica = resa * prezzo;
    const anniIstat = coltura.resa_anni?.length;

    const fonteVariabilita = Number.isFinite(coltura.volatilita_prezzo)
      ? `volatilita prezzo misurata su indice ISTAT (${Math.round(coltura.volatilita_prezzo * 100)}%) e variabilita di resa stimata (${Math.round((coltura.volatilita_resa_stimata ?? 0) * 100)}%)`
      : 'coefficiente di variabilita dichiarato';

    const metodo =
      coltura.resa_fonte === 'istat'
        ? `resa ISTAT (${coltura.resa_anni?.join('-') ?? 'Veneto'}) x prezzo stimato, range ±${Math.round(variabilita * 100)}% da ${fonteVariabilita}`
        : `resa e prezzo stimati, range ±${Math.round(variabilita * 100)}% da ${fonteVariabilita}`;

    return {
      scarsa: Math.round(tipica * (1 - variabilita)),
      tipica: Math.round(tipica),
      buona: Math.round(tipica * (1 + variabilita)),
      metodo,
      anni: anniIstat ?? null,
    };
  }

  const curato = coltura.plv_eur_ha ?? {};
  return {
    scarsa: Math.round(curato.scarsa ?? 0),
    tipica: Math.round(curato.tipica ?? 0),
    buona: Math.round(curato.buona ?? 0),
    metodo: 'range curato a mano',
    anni: null,
  };
}

/**
 * PLV totale sulla superficie effettivamente destinabile alla coltura.
 *
 * Non usa sempre la superficie inserita: per le colture che non scalano
 * (nicchia, orticole ad alta manodopera) `superficie_max_ha` limita la
 * superficie realisticamente investibile, e moltiplicare su tutta l'azienda
 * produrrebbe un totale fantasioso.
 */
export function plvTotale(plvHa, superficieHa) {
  return {
    scarsa: Math.round(plvHa.scarsa * superficieHa),
    tipica: Math.round(plvHa.tipica * superficieHa),
    buona: Math.round(plvHa.buona * superficieHa),
  };
}

/** Superficie realisticamente investibile nella coltura, dato il totale disponibile. */
export function superficieInvestibile(coltura, superficieHa) {
  const max = coltura.superficie_max_ha;
  if (!Number.isFinite(max)) return superficieHa;
  return Math.min(superficieHa, max);
}

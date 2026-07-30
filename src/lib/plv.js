/**
 * Calcolo della PLV (Produzione Lorda Vendibile).
 *
 * PLV (euro/ha) = resa (q/ha) x prezzo (euro/q). La PAC non e inclusa: i
 * pagamenti diretti non fanno parte della PLV e vanno tenuti separati.
 *
 * NOTA METODOLOGICA sul range annata buona / annata scarsa.
 *
 * Il modo intuitivo di ricavarlo e sbagliato:
 *
 *     PLV_scarsa = resa_p20 x prezzo_p20
 *     PLV_buona  = resa_p80 x prezzo_p80
 *
 * Resa e prezzo sono negativamente correlati: l'annata siccitosa che dimezza la
 * resa e la stessa che fa salire il prezzo. Moltiplicare i due percentili
 * peggiori tra loro descrive uno scenario che storicamente non si e mai
 * verificato e produce un range assurdamente largo.
 *
 * Il modo corretto, che questo modulo implementa quando la serie storica e
 * disponibile: calcolare la PLV di ogni singolo anno, e prendere i percentili
 * della serie di PLV annuali. La correlazione e cosi gia dentro i dati.
 *
 * Finche gli importer ISTAT non hanno popolato `serie_annuale`, si usa il range
 * curato a mano in `plv_eur_ha`, e il metodo viene dichiarato all'utente.
 */

export const PERCENTILE_SCARSA = 20;
export const PERCENTILE_TIPICA = 50;
export const PERCENTILE_BUONA = 80;

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

  if (Array.isArray(serie) && serie.length >= 5) {
    // Percentili sulla serie di PLV annuali: la correlazione resa/prezzo e
    // gia incorporata, il range risulta realisticamente piu stretto.
    const plvAnnuali = serie
      .filter((a) => Number.isFinite(a.resa_q_ha) && Number.isFinite(a.prezzo_eur_q))
      .map((a) => a.resa_q_ha * a.prezzo_eur_q);

    if (plvAnnuali.length >= 5) {
      return {
        scarsa: Math.round(percentile(plvAnnuali, PERCENTILE_SCARSA)),
        tipica: Math.round(percentile(plvAnnuali, PERCENTILE_TIPICA)),
        buona: Math.round(percentile(plvAnnuali, PERCENTILE_BUONA)),
        metodo: 'percentili su serie annuale ISTAT',
        anni: plvAnnuali.length,
      };
    }
  }

  const curato = coltura.plv_eur_ha ?? {};
  return {
    scarsa: Math.round(curato.scarsa ?? 0),
    tipica: Math.round(curato.tipica ?? 0),
    buona: Math.round(curato.buona ?? 0),
    metodo: 'range curato, in attesa di import ISTAT',
    anni: null,
  };
}

/**
 * PLV totale sulla superficie effettivamente destinabile alla coltura.
 *
 * Non usa sempre la superficie inserita: per le colture che non scalano (nicchia,
 * orticole ad alta manodopera) `superficie_max_ha` limita la superficie
 * realisticamente investibile, e moltiplicare su tutta l'azienda produrrebbe un
 * totale fantasioso.
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

const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const numero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

export function formattaEuro(valore) {
  if (!Number.isFinite(valore)) return '-';
  return euro.format(valore);
}

export function formattaNumero(valore) {
  if (!Number.isFinite(valore)) return '-';
  return numero.format(valore);
}

export function formattaEttari(valore) {
  if (!Number.isFinite(valore)) return '-';
  return `${numero.format(valore)} ha`;
}

export const ETICHETTE_IRRIGAZIONE = {
  necessaria: 'Indispensabile',
  consigliata: 'Consigliata',
  non_necessaria: 'Non necessaria',
};

export const ETICHETTE_AFFIDABILITA = {
  istat: {
    breve: 'Dato ISTAT',
    titolo: 'Resa da ISTAT DCSP_COLTIVAZIONI e prezzo da DCSP_PREZZIAGR: calcolo riproducibile.',
  },
  stima_esperto: {
    breve: 'Stima di settore',
    titolo: 'Valore di inquadramento da esperienza di settore e letteratura tecnica, non ancora ricalcolato sulle serie ISTAT.',
  },
  sperimentale: {
    breve: 'Sperimentale',
    titolo: 'Coltura senza dati agronomico-economici pubblici per l\'Italia: valore indicativo con incertezza elevata.',
  },
};

export function etichettaAffidabilita(chiave) {
  return ETICHETTE_AFFIDABILITA[chiave] ?? { breve: chiave, titolo: '' };
}

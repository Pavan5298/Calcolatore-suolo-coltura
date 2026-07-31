/**
 * Parser per gli export CSV del databrowser ISTAT.
 *
 * Modulo puro, senza effetti collaterali: gli importer lo importano senza
 * eseguirsi a vicenda.
 *
 * Gli export ISTAT hanno due particolarita che rompono un parser CSV ingenuo:
 *
 *  1. l'intestazione contiene una virgoletta spuria a meta campo
 *     ('Stato dell"'osservazione'), che trattata come delimitatore fa inghiottire
 *     il resto del file in un unico campo;
 *  2. denominazioni e note metodologiche sono racchiuse tra APICI SINGOLI, che
 *     il formato CSV non riconosce come quoting: le virgole interne spezzano il
 *     campo e la riga risulta piu lunga dell'intestazione. Riguarda circa un
 *     terzo delle righe, quindi scartarle non e accettabile.
 *
 * Lo sfasamento del punto 2 puo cadere prima o dopo le colonne utili a seconda
 * del campo coinvolto, quindi non si puo indicizzare ne dalla testa ne dalla
 * coda. L'ancora affidabile e TIME_PERIOD, riconoscibile per forma.
 */

/** Divide il testo in righe di campi, gestendo il quoting reale. */
function dividiCampi(testo) {
  const righe = [];
  let riga = [];
  let campo = '';
  let inVirgolette = false;

  for (let i = 0; i < testo.length; i += 1) {
    const c = testo[i];

    if (inVirgolette) {
      if (c === '"') {
        if (testo[i + 1] === '"') { campo += '"'; i += 1; } else { inVirgolette = false; }
      } else {
        campo += c;
      }
      continue;
    }

    // Una virgoletta apre un campo quotato SOLO a inizio campo.
    if (c === '"' && campo === '') { inVirgolette = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    campo += c;
  }

  if (campo !== '' || riga.length > 0) { riga.push(campo); righe.push(riga); }
  return righe;
}

/**
 * @param {string} testo contenuto del CSV (BOM gia rimosso o no, si gestisce)
 * @param {object} [opzioni]
 * @param {RegExp} [opzioni.ancoraPeriodo] forma di TIME_PERIOD: anno per i dati
 *   annuali, anno-mese per i mensili
 * @param {string} [opzioni.campoDescrittivo] intestazione del campo di testo che
 *   puo contenere virgole non quotate e precede TIME_PERIOD
 */
export function parseCsv(testo, opzioni = {}) {
  const { ancoraPeriodo = /^\d{4}(-\d{2})?$/, campoDescrittivo = null } = opzioni;

  const righe = dividiCampi(testo.replace(/^﻿/, ''));
  if (righe.length === 0) return [];

  const intestazione = righe[0].map((k) => k.trim());
  const iPeriodo = intestazione.indexOf('TIME_PERIOD');
  if (iPeriodo < 0) return [];

  const iDescrittivo = campoDescrittivo ? intestazione.indexOf(campoDescrittivo) : iPeriodo - 1;
  const testa = intestazione.slice(0, Math.max(0, iDescrittivo));

  return righe
    .slice(1)
    .map((r) => {
      if (r.length === intestazione.length && ancoraPeriodo.test(r[iPeriodo] ?? '')) {
        return Object.fromEntries(intestazione.map((k, i) => [k, r[i]]));
      }

      // Riga sfasata: si ritrova TIME_PERIOD per forma e si ricostruisce.
      const pos = r.findIndex((v, i) => i >= iDescrittivo && ancoraPeriodo.test(v ?? ''));
      if (pos < 0) return null;

      const record = Object.fromEntries(testa.map((k, i) => [k, r[i]]));
      if (iDescrittivo >= 0 && intestazione[iDescrittivo]) {
        record[intestazione[iDescrittivo]] = r.slice(iDescrittivo, pos).join(',');
      }
      record.TIME_PERIOD = r[pos];
      record.Osservazione = r[pos + 1];
      return record;
    })
    .filter(Boolean);
}

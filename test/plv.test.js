import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { percentile, plvPerEttaro, plvTotale, superficieInvestibile } from '../src/lib/plv.js';

describe('percentile', () => {
  it('interpola linearmente tra i valori ordinati', () => {
    const valori = [10, 20, 30, 40, 50];
    assert.equal(percentile(valori, 0), 10);
    assert.equal(percentile(valori, 50), 30);
    assert.equal(percentile(valori, 100), 50);
    assert.equal(percentile(valori, 25), 20);
  });

  it('non dipende dall ordine di ingresso', () => {
    assert.equal(percentile([50, 10, 30, 40, 20], 50), 30);
  });

  it('gestisce i casi degeneri', () => {
    assert.equal(percentile([], 50), null);
    assert.equal(percentile([7], 20), 7);
    assert.equal(percentile(null, 50), null);
  });
});

describe('plvPerEttaro', () => {
  it('usa il range curato quando non c e serie storica', () => {
    const risultato = plvPerEttaro({ plv_eur_ha: { scarsa: 1500, tipica: 2400, buona: 3200 } });
    assert.deepEqual(
      { scarsa: risultato.scarsa, tipica: risultato.tipica, buona: risultato.buona },
      { scarsa: 1500, tipica: 2400, buona: 3200 },
    );
    assert.equal(risultato.anni, null);
    assert.match(risultato.metodo, /curato/);
  });

  it('preferisce la serie annuale quando disponibile', () => {
    const serie = [
      { anno: 2015, resa_q_ha: 100, prezzo_eur_q: 20 },
      { anno: 2016, resa_q_ha: 110, prezzo_eur_q: 19 },
      { anno: 2017, resa_q_ha: 90, prezzo_eur_q: 24 },
      { anno: 2018, resa_q_ha: 105, prezzo_eur_q: 21 },
      { anno: 2019, resa_q_ha: 95, prezzo_eur_q: 23 },
    ];
    const risultato = plvPerEttaro({ serie_annuale: serie, plv_eur_ha: { scarsa: 1, tipica: 2, buona: 3 } });

    assert.equal(risultato.anni, 5);
    assert.match(risultato.metodo, /serie annuale/);
    // le PLV annuali sono 2000, 2090, 2160, 2205, 2185
    assert.equal(risultato.tipica, 2160);
  });

  it('e questo il punto: la correlazione negativa resa-prezzo stringe il range', () => {
    // Serie costruita con correlazione negativa perfetta: la resa scende, il
    // prezzo sale. Il metodo ingenuo (percentile resa x percentile prezzo)
    // produrrebbe un range molto piu largo di quello reale.
    const serie = [
      { anno: 2015, resa_q_ha: 130, prezzo_eur_q: 16 },
      { anno: 2016, resa_q_ha: 120, prezzo_eur_q: 18 },
      { anno: 2017, resa_q_ha: 110, prezzo_eur_q: 20 },
      { anno: 2018, resa_q_ha: 100, prezzo_eur_q: 22 },
      { anno: 2019, resa_q_ha: 70, prezzo_eur_q: 30 },
    ];
    const risultato = plvPerEttaro({ serie_annuale: serie });

    const rese = serie.map((a) => a.resa_q_ha);
    const prezzi = serie.map((a) => a.prezzo_eur_q);
    const ingenuoScarsa = percentile(rese, 20) * percentile(prezzi, 20);
    const ingenuoBuona = percentile(rese, 80) * percentile(prezzi, 80);

    const ampiezzaCorretta = risultato.buona - risultato.scarsa;
    const ampiezzaIngenua = ingenuoBuona - ingenuoScarsa;

    assert.ok(
      ampiezzaCorretta < ampiezzaIngenua,
      `il range corretto (${ampiezzaCorretta}) deve essere piu stretto dell ingenuo (${ampiezzaIngenua})`,
    );
  });

  it('ignora una serie troppo corta e ricade sul range curato', () => {
    const risultato = plvPerEttaro({
      serie_annuale: [
        { anno: 2022, resa_q_ha: 100, prezzo_eur_q: 20 },
        { anno: 2023, resa_q_ha: 105, prezzo_eur_q: 21 },
      ],
      plv_eur_ha: { scarsa: 1500, tipica: 2400, buona: 3200 },
    });
    assert.equal(risultato.tipica, 2400);
    assert.equal(risultato.anni, null);
  });

  it('scarta le osservazioni incomplete della serie', () => {
    const serie = [
      { anno: 2015, resa_q_ha: 100, prezzo_eur_q: 20 },
      { anno: 2016, resa_q_ha: null, prezzo_eur_q: 19 },
      { anno: 2017, resa_q_ha: 90, prezzo_eur_q: 24 },
      { anno: 2018, resa_q_ha: 105, prezzo_eur_q: 21 },
      { anno: 2019, resa_q_ha: 95, prezzo_eur_q: 23 },
    ];
    // 4 osservazioni valide: sotto il minimo di 5, si ricade sul range curato
    const risultato = plvPerEttaro({ serie_annuale: serie, plv_eur_ha: { scarsa: 10, tipica: 20, buona: 30 } });
    assert.equal(risultato.tipica, 20);
  });
});

describe('superficieInvestibile e plvTotale', () => {
  it('limita la superficie alle colture che non scalano', () => {
    assert.equal(superficieInvestibile({ superficie_max_ha: 5 }, 100), 5);
    assert.equal(superficieInvestibile({ superficie_max_ha: 5 }, 3), 3);
    assert.equal(superficieInvestibile({ superficie_max_ha: null }, 100), 100);
  });

  it('moltiplica il range per la superficie', () => {
    const totale = plvTotale({ scarsa: 1000, tipica: 2000, buona: 3000 }, 12.5);
    assert.deepEqual(totale, { scarsa: 12500, tipica: 25000, buona: 37500 });
  });
});

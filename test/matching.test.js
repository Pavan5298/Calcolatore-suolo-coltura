import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TERRENI, getColture, getProvince, getProvincia } from '../src/data/index.js';
import { CATEGORIA_NICCHIA, MAX_RISULTATI, MIN_RISULTATI, suggerisci, valuta } from '../src/lib/matching.js';

const colture = getColture();
const trova = (slug) => colture.find((c) => c.slug === slug);

const criteriBase = {
  provincia: getProvincia('RO'),
  terreno: 'argilloso',
  superficieHa: 20,
  irrigazione: true,
};

describe('filtri rigidi', () => {
  it('esclude una coltura che richiede irrigazione se l irrigazione non c e', () => {
    const riso = trova('riso');
    assert.equal(riso.irrigazione, 'necessaria');

    const conAcqua = valuta(riso, { ...criteriBase, irrigazione: true });
    const senzAcqua = valuta(riso, { ...criteriBase, irrigazione: false });

    assert.equal(conAcqua.ammessa, true);
    assert.equal(senzAcqua.ammessa, false);
    assert.ok(senzAcqua.esclusioni.some((e) => e.includes('irrigazione')));
  });

  it('esclude per tessitura incompatibile', () => {
    // il riso vuole terreni impermeabili: sul sabbioso non e proponibile
    const esito = valuta(trova('riso'), { ...criteriBase, terreno: 'sabbioso' });
    assert.equal(esito.ammessa, false);
    assert.ok(esito.esclusioni.some((e) => e.startsWith('non adatta a terreno')));
  });

  it('esclude per fascia altimetrica non compatibile', () => {
    const esito = valuta(trova('mais'), { ...criteriBase, provincia: getProvincia('BL') });
    assert.equal(esito.ammessa, false);
    assert.ok(esito.esclusioni.some((e) => e.includes('altimetrica') || e.includes('comprensori')));
  });

  it('esclude per superficie sotto la soglia minima', () => {
    const esito = valuta(trova('mais'), { ...criteriBase, superficieHa: 0.5 });
    assert.equal(esito.ammessa, false);
    assert.ok(esito.esclusioni.some((e) => e.includes('superficie minima')));
  });
});

describe('punteggio', () => {
  it('premia la tessitura ottimale rispetto alla sola compatibilita', () => {
    const soia = trova('soia');
    assert.ok(soia.terreni_ottimali.includes('argilloso'));
    assert.ok(soia.terreni.includes('misto'));
    assert.ok(!soia.terreni_ottimali.includes('misto'));

    const ottimale = valuta(soia, { ...criteriBase, terreno: 'argilloso' });
    const compatibile = valuta(soia, { ...criteriBase, terreno: 'misto' });
    assert.ok(ottimale.punteggio > compatibile.punteggio);
  });

  it('avvisa quando una coltura che vuole irrigazione viene messa in asciutto', () => {
    const esito = valuta(trova('mais'), { ...criteriBase, irrigazione: false });
    assert.equal(esito.ammessa, true);
    assert.ok(esito.avvertenze.some((a) => a.includes('asciutto')));
  });

  it('penalizza e segnala le colture che non scalano sulla superficie inserita', () => {
    const esito = valuta(trova('luffa'), { ...criteriBase, terreno: 'sabbioso', superficieHa: 200 });
    assert.ok(esito.avvertenze.some((a) => a.includes('non scala')));
  });

  it('colloca i dati sperimentali sotto le stime di settore, a parita di condizioni', () => {
    const sperimentali = colture.filter((c) => c.affidabilita === 'sperimentale');
    assert.ok(sperimentali.length > 0, 'il dataset deve contenere colture sperimentali');
  });
});

describe('suggerisci', () => {
  it('restituisce al massimo MAX_RISULTATI colture principali', () => {
    const esito = suggerisci(colture, criteriBase);
    assert.ok(esito.principali.length <= MAX_RISULTATI);
  });

  it('tiene le colture di nicchia in un elenco separato', () => {
    const esito = suggerisci(colture, criteriBase);
    assert.ok(esito.principali.every((r) => r.coltura.categoria !== CATEGORIA_NICCHIA));
    assert.ok(esito.nicchia.every((r) => r.coltura.categoria === CATEGORIA_NICCHIA));
  });

  it('ordina le principali per punteggio decrescente', () => {
    const esito = suggerisci(colture, criteriBase);
    const punteggi = esito.principali.map((r) => r.punteggio);
    assert.deepEqual(punteggi, [...punteggi].sort((a, b) => b - a));
  });

  it('allega la PLV per ettaro e totale a ogni risultato', () => {
    const esito = suggerisci(colture, criteriBase);
    for (const r of esito.principali) {
      assert.ok(r.plvHa.tipica > 0, `${r.coltura.slug}: PLV per ettaro mancante`);
      assert.equal(r.plvTotale.tipica, Math.round(r.plvHa.tipica * r.superficieConsiderataHa));
    }
  });

  it('calcola il totale sulla superficie investibile, non su quella inserita', () => {
    const esito = suggerisci(colture, { ...criteriBase, terreno: 'sabbioso', superficieHa: 500 });
    const tutte = [...esito.principali, ...esito.nicchia];
    const limitate = tutte.filter((r) => Number.isFinite(r.coltura.superficie_max_ha));

    for (const r of limitate) {
      assert.equal(r.superficieConsiderataHa, r.coltura.superficie_max_ha);
      assert.ok(r.superficieConsiderataHa < 500);
    }
  });

  it('garantisce almeno MIN_RISULTATI colture per ogni combinazione possibile', () => {
    // Il requisito MVP e "3-5 colture". Questo test copre l intero spazio di
    // input: 7 province x 4 tessiture x irrigazione si/no x 3 scale di superficie.
    const fallimenti = [];

    for (const provincia of getProvince()) {
      for (const terreno of TERRENI) {
        for (const irrigazione of [true, false]) {
          for (const superficieHa of [1, 20, 300]) {
            const esito = suggerisci(colture, { provincia, terreno, superficieHa, irrigazione });
            const totale = esito.principali.length;
            if (totale < MIN_RISULTATI) {
              fallimenti.push(
                `${provincia.sigla}/${terreno}/${irrigazione ? 'irrigato' : 'asciutto'}/${superficieHa}ha -> ${totale}`,
              );
            }
          }
        }
      }
    }

    assert.deepEqual(fallimenti, [], `combinazioni con meno di ${MIN_RISULTATI} colture:\n${fallimenti.join('\n')}`);
  });

  it('segnala esplicitamente quando ha dovuto allentare il vincolo di tessitura', () => {
    // Belluno e montagna: pochissime colture del dataset sono proponibili, quindi
    // il ripescaggio con riserva deve attivarsi e deve essere dichiarato.
    const esito = suggerisci(colture, {
      provincia: getProvincia('BL'),
      terreno: 'argilloso',
      superficieHa: 5,
      irrigazione: false,
    });

    assert.ok(esito.principali.length >= MIN_RISULTATI);
    if (esito.conRiserva) {
      const conRiserva = esito.principali.filter((r) => r.conRiserva);
      assert.ok(conRiserva.length > 0);
      assert.ok(conRiserva.every((r) => r.avvertenze.some((a) => a.includes('non ideale'))));
    }
  });
});

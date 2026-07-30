import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CLASSI_SEMPLIFICATE,
  CLASSI_USDA,
  analizzaTessitura,
  caratteristicheTessitura,
  classificaUsda,
  profiloDaClasse,
} from '../src/lib/tessitura.js';

describe('triangolo USDA', () => {
  it('classifica i vertici del triangolo', () => {
    assert.equal(classificaUsda(95, 3, 2), 'sabbia');
    assert.equal(classificaUsda(5, 90, 5), 'limo');
    assert.equal(classificaUsda(20, 20, 60), 'argilla');
  });

  it('classifica i casi tipici della pianura veneta', () => {
    // franco: il centro del triangolo, la tessitura piu versatile
    assert.equal(classificaUsda(40, 40, 20), 'franco');
    // argilla del medio Polesine
    assert.equal(classificaUsda(25, 30, 45), 'argilla');
    // sabbie del Delta: con solo 20% di limo+argilla siamo in sabbia franca,
    // non ancora in franco sabbioso
    assert.equal(classificaUsda(80, 12, 8), 'sabbia_franca');
    assert.equal(classificaUsda(65, 25, 10), 'franco_sabbioso');
    // limi golenali
    assert.equal(classificaUsda(20, 62, 18), 'franco_limoso');
  });

  it('distingue franco argilloso da argilla', () => {
    assert.equal(classificaUsda(33, 34, 33), 'franco_argilloso');
    assert.equal(classificaUsda(30, 25, 45), 'argilla');
  });

  it('riconduce ogni classe USDA a una delle quattro semplificate', () => {
    for (const [chiave, valore] of Object.entries(CLASSI_USDA)) {
      assert.ok(
        CLASSI_SEMPLIFICATE.includes(valore.semplificata),
        `${chiave}: semplificata ${valore.semplificata} non ammessa`,
      );
    }
  });

  it('copre tutto lo spazio del triangolo senza buchi', () => {
    // Se la cascata avesse un buco, qualche combinazione valida non verrebbe
    // classificata. Si scandisce l intero triangolo a passo di 1 punto.
    for (let argilla = 0; argilla <= 100; argilla += 1) {
      for (let limo = 0; limo + argilla <= 100; limo += 1) {
        const sabbia = 100 - argilla - limo;
        const classe = classificaUsda(sabbia, limo, argilla);
        assert.ok(CLASSI_USDA[classe], `nessuna classe per S${sabbia}/L${limo}/A${argilla}`);
      }
    }
  });
});

describe('analizzaTessitura', () => {
  it('accetta percentuali che sommano a 100', () => {
    const esito = analizzaTessitura(40, 40, 20);
    assert.equal(esito.valido, true);
    assert.equal(esito.classeUsda, 'franco');
    assert.equal(esito.semplificata, 'misto');
    assert.equal(esito.nomeUsda, 'Franco');
  });

  it('normalizza gli arrotondamenti entro la tolleranza', () => {
    // Le analisi del suolo arrotondano: 98% o 102% devono passare, riscalati.
    const esito = analizzaTessitura(39, 39, 20);
    assert.equal(esito.valido, true);
    const somma = esito.sabbia + esito.limo + esito.argilla;
    assert.ok(Math.abs(somma - 100) < 0.5, `somma normalizzata ${somma}`);
  });

  it('rifiuta somme fuori tolleranza spiegando il motivo', () => {
    const esito = analizzaTessitura(10, 10, 10);
    assert.equal(esito.valido, false);
    assert.match(esito.errore, /sommano a 30/);
  });

  it('rifiuta valori non numerici o fuori scala', () => {
    assert.equal(analizzaTessitura(NaN, 40, 20).valido, false);
    assert.equal(analizzaTessitura(-5, 60, 45).valido, false);
    assert.equal(analizzaTessitura(120, 0, 0).valido, false);
  });

  it('rifiuta il caso tutto a zero senza dividere per zero', () => {
    const esito = analizzaTessitura(0, 0, 0);
    assert.equal(esito.valido, false);
    assert.match(esito.errore, /zero/);
  });
});

describe('profiloDaClasse', () => {
  it('restituisce un profilo coerente con la classe di partenza', () => {
    for (const classe of CLASSI_SEMPLIFICATE) {
      const profilo = profiloDaClasse(classe);
      assert.ok(profilo, `nessun profilo per ${classe}`);
      assert.equal(profilo.semplificata, classe);

      const somma = profilo.sabbia + profilo.limo + profilo.argilla;
      assert.equal(somma, 100, `${classe}: il profilo tipo non somma a 100`);

      // Il profilo tipo, riclassificato, deve ricadere nella stessa classe
      // semplificata: altrimenti preset e analisi darebbero consigli diversi
      // per lo stesso terreno.
      const riclassificato = analizzaTessitura(profilo.sabbia, profilo.limo, profilo.argilla);
      assert.equal(riclassificato.semplificata, classe, `${classe}: il profilo tipo si riclassifica come ${riclassificato.semplificata}`);
    }
  });

  it('restituisce null per una classe inesistente', () => {
    assert.equal(profiloDaClasse('vulcanico'), null);
  });
});

describe('caratteristicheTessitura', () => {
  it('segnala i limiti dei terreni pesanti', () => {
    const note = caratteristicheTessitura({ sabbia: 25, limo: 30, argilla: 45 });
    assert.ok(note.some((n) => /pesante/i.test(n)));
  });

  it('segnala la scarsa ritenzione dei terreni sciolti', () => {
    const note = caratteristicheTessitura({ sabbia: 80, limo: 12, argilla: 8 });
    assert.ok(note.some((n) => /sciolto/i.test(n)));
  });

  it('riconosce la tessitura equilibrata', () => {
    const note = caratteristicheTessitura({ sabbia: 40, limo: 40, argilla: 20 });
    assert.ok(note.some((n) => /equilibrata/i.test(n)));
  });
});

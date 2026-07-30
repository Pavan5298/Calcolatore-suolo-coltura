/**
 * Test di integrita del dataset curato a mano.
 *
 * Il dataset e la parte del progetto che cambia piu spesso e a mano, quindi e
 * quella dove gli errori entrano piu facilmente. Questi test sono la rete di
 * sicurezza per ogni modifica futura a colture.json, province.json e comuni.json.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TERRENI, getColture, getComuni, getProvince } from '../src/data/index.js';

const colture = getColture();
const province = getProvince();
const comuni = getComuni();

const SIGLE = new Set(province.map((p) => p.sigla));
const ALTIMETRIE = new Set(['pianura', 'collina', 'montagna']);
const IRRIGAZIONI = new Set(['necessaria', 'consigliata', 'non_necessaria']);
const AFFIDABILITA = new Set(['istat', 'stima_esperto', 'sperimentale']);
const CICLI = new Set(['annuale', 'poliennale']);

describe('dataset colture', () => {
  it('ha slug unici', () => {
    const slug = colture.map((c) => c.slug);
    assert.equal(new Set(slug).size, slug.length);
  });

  it('usa slug in forma di URL', () => {
    for (const c of colture) {
      assert.match(c.slug, /^[a-z0-9-]+$/, `slug non valido: ${c.slug}`);
    }
  });

  it('dichiara solo tessiture, altimetrie, cicli e sigle validi', () => {
    for (const c of colture) {
      for (const t of c.terreni) assert.ok(TERRENI.includes(t), `${c.slug}: tessitura ${t}`);
      for (const t of c.terreni_ottimali) {
        assert.ok(TERRENI.includes(t), `${c.slug}: tessitura ottimale ${t}`);
        assert.ok(c.terreni.includes(t), `${c.slug}: ${t} e ottimale ma non compatibile`);
      }
      for (const a of c.altimetria) assert.ok(ALTIMETRIE.has(a), `${c.slug}: altimetria ${a}`);
      for (const p of c.province) assert.ok(SIGLE.has(p), `${c.slug}: provincia ${p}`);
      assert.ok(IRRIGAZIONI.has(c.irrigazione), `${c.slug}: irrigazione ${c.irrigazione}`);
      assert.ok(AFFIDABILITA.has(c.affidabilita), `${c.slug}: affidabilita ${c.affidabilita}`);
      assert.ok(CICLI.has(c.ciclo), `${c.slug}: ciclo ${c.ciclo}`);
    }
  });

  it('ha almeno una tessitura ottimale e almeno una provincia per coltura', () => {
    for (const c of colture) {
      assert.ok(c.terreni.length > 0, `${c.slug}: nessuna tessitura`);
      assert.ok(c.terreni_ottimali.length > 0, `${c.slug}: nessuna tessitura ottimale`);
      assert.ok(c.province.length > 0, `${c.slug}: nessuna provincia`);
      assert.ok(c.altimetria.length > 0, `${c.slug}: nessuna altimetria`);
    }
  });

  it('ha range monotoni: scarsa <= tipica <= buona', () => {
    for (const c of colture) {
      assert.ok(c.resa_q_ha.scarsa <= c.resa_q_ha.tipica, `${c.slug}: resa scarsa > tipica`);
      assert.ok(c.resa_q_ha.tipica <= c.resa_q_ha.buona, `${c.slug}: resa tipica > buona`);
      assert.ok(c.prezzo_eur_q.scarso <= c.prezzo_eur_q.tipico, `${c.slug}: prezzo scarso > tipico`);
      assert.ok(c.prezzo_eur_q.tipico <= c.prezzo_eur_q.buono, `${c.slug}: prezzo tipico > buono`);
      assert.ok(c.plv_eur_ha.scarsa <= c.plv_eur_ha.tipica, `${c.slug}: PLV scarsa > tipica`);
      assert.ok(c.plv_eur_ha.tipica <= c.plv_eur_ha.buona, `${c.slug}: PLV tipica > buona`);
    }
  });

  it('ha valori di PLV positivi', () => {
    for (const c of colture) {
      assert.ok(c.plv_eur_ha.scarsa > 0, `${c.slug}: PLV scarsa non positiva`);
    }
  });

  it('ha una PLV coerente con resa x prezzo, entro una tolleranza dichiarata', () => {
    // Il range di PLV e piu stretto del prodotto dei percentili peggiori/migliori,
    // di proposito: resa e prezzo sono negativamente correlati. Il controllo
    // verifica solo che il valore tipico non sia scollegato dai suoi componenti.
    for (const c of colture) {
      const atteso = c.resa_q_ha.tipica * c.prezzo_eur_q.tipico;
      const scarto = Math.abs(c.plv_eur_ha.tipica - atteso) / atteso;
      assert.ok(scarto < 0.12, `${c.slug}: PLV tipica ${c.plv_eur_ha.tipica} contro resa x prezzo ${Math.round(atteso)}`);
    }
  });

  it('non promette un range piu largo del prodotto dei percentili estremi', () => {
    for (const c of colture) {
      const massimoIngenuo = c.resa_q_ha.buona * c.prezzo_eur_q.buono;
      assert.ok(
        c.plv_eur_ha.buona <= massimoIngenuo * 1.02,
        `${c.slug}: PLV in annata buona superiore al massimo teorico resa x prezzo`,
      );
    }
  });

  it('ha superfici minime e massime sensate', () => {
    for (const c of colture) {
      assert.ok(c.superficie_min_ha > 0, `${c.slug}: superficie minima non positiva`);
      if (c.superficie_max_ha !== null) {
        assert.ok(c.superficie_max_ha > c.superficie_min_ha, `${c.slug}: massimo <= minimo`);
      }
    }
  });

  it('dichiara fonte e note per ogni coltura', () => {
    for (const c of colture) {
      assert.ok(c.fonte && c.fonte.length > 10, `${c.slug}: fonte assente o troppo generica`);
      assert.ok(c.note && c.note.length > 20, `${c.slug}: note agronomiche assenti`);
      assert.ok(Array.isArray(c.avvertenze), `${c.slug}: avvertenze deve essere un array`);
    }
  });

  it('accompagna ogni coltura sperimentale con almeno un avvertimento', () => {
    // Se il dato e sperimentale, l utente deve poterlo sapere senza cercarlo.
    for (const c of colture.filter((x) => x.affidabilita === 'sperimentale')) {
      assert.ok(c.avvertenze.length > 0, `${c.slug}: coltura sperimentale senza avvertenze`);
      assert.ok(
        c.avvertenze.some((a) => /sperimental/i.test(a)),
        `${c.slug}: nessuna avvertenza dichiara la natura sperimentale del dato`,
      );
    }
  });

  it('include sia le commodity tradizionali sia le nicchie richieste', () => {
    const slug = new Set(colture.map((c) => c.slug));
    for (const atteso of ['mais', 'soia', 'frumento-tenero', 'orzo', 'lenticchia-d-acqua', 'luffa']) {
      assert.ok(slug.has(atteso), `coltura attesa mancante: ${atteso}`);
    }
  });
});

describe('dataset province', () => {
  it('contiene le sette province venete con sigle e slug unici', () => {
    assert.equal(province.length, 7);
    assert.equal(new Set(province.map((p) => p.sigla)).size, 7);
    assert.equal(new Set(province.map((p) => p.slug)).size, 7);
  });

  it('dichiara altimetrie e tessiture valide', () => {
    for (const p of province) {
      assert.ok(p.altimetria.length > 0, `${p.sigla}: nessuna altimetria`);
      for (const a of p.altimetria) assert.ok(ALTIMETRIE.has(a), `${p.sigla}: altimetria ${a}`);
      for (const t of p.terreni_prevalenti) assert.ok(TERRENI.includes(t), `${p.sigla}: tessitura ${t}`);
    }
  });

  it('ha per ogni provincia almeno una coltura proponibile', () => {
    for (const p of province) {
      const disponibili = colture.filter(
        (c) => c.province.includes(p.sigla) && c.altimetria.some((a) => p.altimetria.includes(a)),
      );
      assert.ok(disponibili.length >= 3, `${p.sigla}: solo ${disponibili.length} colture proponibili`);
    }
  });
});

describe('dataset comuni', () => {
  it('ha slug unici e in forma di URL', () => {
    const slug = comuni.map((c) => c.slug);
    assert.equal(new Set(slug).size, slug.length);
    for (const c of comuni) assert.match(c.slug, /^[a-z0-9-]+$/, `slug non valido: ${c.slug}`);
  });

  it('riferisce solo province esistenti e tessiture valide', () => {
    for (const c of comuni) {
      assert.ok(SIGLE.has(c.provincia), `${c.slug}: provincia ${c.provincia}`);
      assert.ok(TERRENI.includes(c.terreno_prevalente), `${c.slug}: tessitura ${c.terreno_prevalente}`);
    }
  });

  it('copre tutti i comuni della provincia di Rovigo', () => {
    const rovigo = comuni.filter((c) => c.provincia === 'RO');
    assert.equal(rovigo.length, 50, 'la provincia di Rovigo ha 50 comuni');
  });

  it('include un comune per ciascuna delle altre sei province', () => {
    for (const sigla of [...SIGLE].filter((s) => s !== 'RO')) {
      assert.ok(comuni.some((c) => c.provincia === sigla), `nessun comune per la provincia ${sigla}`);
    }
  });
});

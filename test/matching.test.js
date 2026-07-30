import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TERRENI, getColture, getProvince, getProvincia } from '../src/data/index.js';
import { MAX_RISULTATI, MIN_RISULTATI, suggerisci, valuta } from '../src/lib/matching.js';
import { profiloDaClasse } from '../src/lib/tessitura.js';

const colture = getColture();
const trova = (slug) => colture.find((c) => c.slug === slug);

const criteriBase = {
  provincia: getProvincia('RO'),
  tessitura: profiloDaClasse('argilloso'),
  superficieHa: 20,
  irrigazione: true,
};

/** Scorciatoia: cambia la sola tessitura dei criteri. */
const conTerreno = (criteri, classe) => ({ ...criteri, tessitura: profiloDaClasse(classe) });

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
    const esito = valuta(trova('riso'), conTerreno(criteriBase, 'sabbioso'));
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

    const ottimale = valuta(soia, conTerreno(criteriBase, 'argilloso'));
    const compatibile = valuta(soia, conTerreno(criteriBase, 'misto'));
    assert.ok(ottimale.punteggio > compatibile.punteggio);
  });

  it('avvisa quando una coltura che vuole irrigazione viene messa in asciutto', () => {
    const esito = valuta(trova('mais'), { ...criteriBase, irrigazione: false });
    assert.equal(esito.ammessa, true);
    assert.ok(esito.avvertenze.some((a) => a.includes('asciutto')));
  });

  it('penalizza e segnala le colture che non scalano sulla superficie inserita', () => {
    const esito = valuta(trova('aglio'), ({ ...conTerreno(criteriBase, 'limoso'), superficieHa: 200 }));
    assert.ok(esito.avvertenze.some((a) => a.includes('non scala')));
  });

  it('non contiene piu colture senza mercato reale', () => {
    // Lenticchia d'acqua e luffa sono state rimosse: mercato troppo ristretto
    // per fondarci una decisione imprenditoriale.
    const slug = new Set(colture.map((c) => c.slug));
    assert.ok(!slug.has('lenticchia-d-acqua'));
    assert.ok(!slug.has('luffa'));
  });
});

describe('parametri agronomici facoltativi', () => {
  it('non penalizza nessuna coltura quando non sono forniti', () => {
    // E il punto centrale del progetto: un dato che l utente non ha inserito non
    // deve influenzare il consiglio in nessuna direzione.
    const senza = suggerisci(colture, criteriBase);
    const conVuoti = suggerisci(colture, {
      ...criteriBase, ph: null, salinita: null, calcare: null, drenaggio: null,
    });
    assert.deepEqual(
      senza.principali.map((r) => r.coltura.slug),
      conVuoti.principali.map((r) => r.coltura.slug),
    );
  });

  it('esclude una coltura con pH fuori dall intervallo di tolleranza', () => {
    // Il mirtillo e acidofilo obbligato: su suolo alcalino non e proponibile.
    const mirtillo = trova('mirtillo');
    assert.ok(mirtillo.ph.massimo < 7);

    const alcalino = valuta(mirtillo, { ...conTerreno(criteriBase, 'sabbioso'), ph: 7.8 });
    assert.equal(alcalino.ammessa, false);
    assert.ok(alcalino.esclusioni.some((e) => e.includes('pH')));

    const acido = valuta(mirtillo, { ...conTerreno(criteriBase, 'sabbioso'), ph: 4.6 });
    assert.equal(acido.ammessa, true);
  });

  it('esclude una coltura con pH sotto il minimo', () => {
    // Il castagno e l opposto: non vegeta su suolo alcalino, l orzo su acido.
    const orzo = trova('orzo');
    const acido = valuta(orzo, { ...criteriBase, ph: 4.5 });
    assert.equal(acido.ammessa, false);
    assert.ok(acido.esclusioni.some((e) => e.includes('sotto il minimo')));
  });

  it('premia il pH ottimale e avvisa su quello solo tollerato', () => {
    const soia = trova('soia');
    const ottimale = valuta(soia, { ...criteriBase, ph: 6.5 });
    const tollerato = valuta(soia, { ...criteriBase, ph: 7.6 });

    assert.equal(ottimale.ammessa, true);
    assert.equal(tollerato.ammessa, true);
    assert.ok(ottimale.punteggio > tollerato.punteggio);
    assert.ok(tollerato.avvertenze.some((a) => a.includes('fuori dall\'ottimale')));
  });

  it('esclude le colture poco tolleranti dove la salinita e elevata', () => {
    // E il caso del Delta del Po: il fagiolo non regge, la barbabietola si.
    const fagiolo = trova('fagiolo-secco');
    const barbabietola = trova('barbabietola-da-zucchero');
    assert.equal(fagiolo.tolleranza_salinita, 'bassa');
    assert.equal(barbabietola.tolleranza_salinita, 'alta');

    const criteri = { ...conTerreno(criteriBase, 'limoso'), salinita: 'elevata' };
    assert.equal(valuta(fagiolo, criteri).ammessa, false);
    const esitoBarbabietola = valuta(barbabietola, criteri);
    assert.equal(esitoBarbabietola.ammessa, true);
    assert.ok(esitoBarbabietola.motivi.some((m) => m.includes('salinita')));
  });

  it('avvisa del rischio di clorosi ferrica su calcare elevato', () => {
    const kiwi = trova('kiwi');
    assert.equal(kiwi.sensibilita_calcare, 'alta');

    const esito = valuta(kiwi, { ...conTerreno(criteriBase, 'limoso'), calcare: 'elevato' });
    assert.ok(esito.avvertenze.some((a) => a.includes('clorosi')));
  });

  it('esclude gli impianti poliennali dove il drenaggio e lento', () => {
    // Su una annuale si interviene sulla sistemazione idraulica prima della
    // semina successiva; un frutteto su suolo asfittico non si recupera.
    const kiwi = trova('kiwi');
    assert.equal(kiwi.ciclo, 'poliennale');
    const arboreo = valuta(kiwi, { ...conTerreno(criteriBase, 'limoso'), drenaggio: 'lento' });
    assert.equal(arboreo.ammessa, false);
    assert.ok(arboreo.esclusioni.some((e) => e.includes('drenaggio lento')));

    const annuale = valuta(trova('cipolla'), { ...conTerreno(criteriBase, 'limoso'), drenaggio: 'lento' });
    assert.equal(annuale.ammessa, true);
    assert.ok(annuale.avvertenze.some((a) => a.includes('Drenaggio lento')));
  });

  it('dichiara apertamente quando i vincoli agronomici lasciano meno di MIN_RISULTATI', () => {
    // pH acido e salinita elevata insieme sono una condizione estrema: e giusto
    // che restino pochissime colture, purche il risultato lo dichiari invece di
    // riempirsi di suggerimenti non proponibili.
    const esito = suggerisci(colture, {
      provincia: getProvincia('RO'),
      tessitura: profiloDaClasse('argilloso'),
      superficieHa: 15,
      irrigazione: true,
      ph: 5,
      salinita: 'elevata',
    });

    assert.ok(esito.principali.length < MIN_RISULTATI);
    assert.equal(esito.sottoSoglia, true);
    assert.ok(esito.principali.length > 0, 'deve restare almeno una coltura proponibile');
  });

  it('non scende mai sotto soglia con i soli vincoli di base', () => {
    const fallimenti = [];
    for (const ph of [6.5, 7, 7.5]) {
      for (const salinita of ['assente', 'moderata']) {
        for (const terreno of TERRENI) {
          const esito = suggerisci(colture, {
            provincia: getProvincia('RO'),
            tessitura: profiloDaClasse(terreno),
            superficieHa: 15,
            irrigazione: true,
            ph,
            salinita,
          });
          if (esito.principali.length < MIN_RISULTATI) {
            fallimenti.push(`pH ${ph} / salinita ${salinita} / ${terreno} -> ${esito.principali.length}`);
          }
          assert.equal(esito.sottoSoglia, esito.principali.length < MIN_RISULTATI);
        }
      }
    }
    assert.deepEqual(fallimenti, [], `combinazioni scoperte:\n${fallimenti.join('\n')}`);
  });
});

describe('guida alla scelta imprenditoriale', () => {
  it('fa emergere una coltura ad alto margine anche se meno diffusa', () => {
    // Il difetto della prima versione: il punteggio pesava la diffusione, quindi
    // vincevano sempre mais e soia e il calcolatore consigliava a tutti di fare
    // quello che gia facevano. Il pomodoro da industria ha una PLV quattro volte
    // la soia e deve poter comparire.
    const pomodoro = trova('pomodoro-da-industria');
    const soia = trova('soia');

    // Sul margine per ettaro il pomodoro vale molte volte la soia; sul margine
    // per ora e la soia a vincere, perche e meccanizzata. Sono due classifiche
    // diverse ed e giusto che lo siano: il calcolatore deve mostrarle entrambe,
    // non decidere al posto dell'imprenditore quale conti di piu.
    assert.ok(pomodoro.margine_lordo_eur_ha > soia.margine_lordo_eur_ha * 2);
    assert.ok(soia.margine_eur_ora > pomodoro.margine_eur_ora);

    const criteri = { ...conTerreno(criteriBase, 'limoso'), provincia: getProvincia('RO') };
    const esito = suggerisci(colture, criteri);

    // Il punto della modifica: con il vecchio punteggio, dominato dalla
    // diffusione, il pomodoro non compariva mai. Ora deve essere visibile.
    const visibili = [...esito.principali, ...esito.alternative].map((r) => r.coltura.slug);
    assert.ok(visibili.includes('pomodoro-da-industria'));
    assert.ok(
      esito.principali.some((r) => r.coltura.slug === 'pomodoro-da-industria'),
      `pomodoro fuori dalle schede in dettaglio: ${esito.principali.map((r) => r.coltura.slug).join(', ')}`,
    );
  });

  it('mostra tutte le colture ammesse, non solo le prime', () => {
    // Nascondere 60 opzioni dietro un top-5 non guida nessuna scelta.
    const esito = suggerisci(colture, conTerreno(criteriBase, 'limoso'));
    assert.equal(esito.principali.length + esito.alternative.length, esito.ammesse);
    assert.ok(esito.alternative.length > 20, 'la tabella di confronto deve coprire il resto del ventaglio');
  });

  it('ordina per margine lordo, non per PLV', () => {
    // Due colture con PLV simile ma costi molto diversi non possono valere uguale.
    const criteri = conTerreno(criteriBase, 'limoso');
    const coppie = colture
      .filter((c) => c.province.includes('RO') && c.terreni.includes('limoso'))
      .map((c) => ({ c, v: valuta(c, criteri) }))
      .filter((x) => x.v.ammessa);

    assert.ok(coppie.length > 5);
    // il margine deve spiegare l'ordinamento meglio della sola PLV
    const perPunteggio = [...coppie].sort((a, b) => b.v.punteggio - a.v.punteggio);
    const primi = perPunteggio.slice(0, 5).map((x) => x.c.margine_lordo_eur_ha);
    const ultimi = perPunteggio.slice(-5).map((x) => x.c.margine_lordo_eur_ha);
    const media = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    assert.ok(media(primi) > media(ultimi), 'i primi in classifica devono avere margine medio superiore');
  });

  it('esclude le colture oltre la manodopera dichiarata', () => {
    const peperone = trova('peperone');
    assert.ok(peperone.manodopera_ore_ha > 400);

    const conAvventizi = valuta(peperone, { ...conTerreno(criteriBase, 'limoso'), manodopera: 'stagionali' });
    const soloConduttore = valuta(peperone, { ...conTerreno(criteriBase, 'limoso'), manodopera: 'limitata' });

    assert.equal(conAvventizi.ammessa, true);
    assert.equal(soloConduttore.ammessa, false);
    assert.ok(soloConduttore.esclusioni.some((e) => e.includes('ore/ha')));
  });

  it('esclude gli impianti pluriennali con orizzonte annuale', () => {
    const melo = trova('mela');
    assert.equal(melo.ciclo, 'poliennale');
    const esito = valuta(melo, { ...conTerreno(criteriBase, 'limoso'), orizzonte: 'annuale' });
    assert.equal(esito.ammessa, false);
    assert.ok(esito.esclusioni.some((e) => e.includes('orizzonte')));
  });

  it('dichiara investimento e anni di attesa per gli impianti pluriennali', () => {
    const esito = valuta(trova('mela'), conTerreno(criteriBase, 'limoso'));
    assert.ok(esito.avvertenze.some((a) => /investimento indicativo/.test(a)));
    assert.ok(esito.avvertenze.some((a) => /anni prima della piena produzione/.test(a)));
  });

  it('segnala le colture che richiedono un contratto di filiera', () => {
    const esito = valuta(trova('pomodoro-da-industria'), conTerreno(criteriBase, 'limoso'));
    assert.ok(esito.avvertenze.some((a) => a.includes('contratto')));
  });

  it('calcola margine, costi e ore sulla superficie considerata', () => {
    const esito = suggerisci(colture, { ...conTerreno(criteriBase, 'limoso'), superficieHa: 12 });
    for (const r of esito.principali) {
      const ha = r.superficieConsiderataHa;
      assert.equal(r.margineTotale, Math.round(r.coltura.margine_lordo_eur_ha * ha));
      assert.equal(r.costiTotale, Math.round(r.coltura.costi_eur_ha * ha));
      assert.equal(r.oreTotali, Math.round(r.coltura.manodopera_ore_ha * ha));
    }
  });
});

describe('suggerisci', () => {
  it('restituisce al massimo MAX_RISULTATI colture principali', () => {
    const esito = suggerisci(colture, criteriBase);
    assert.ok(esito.principali.length <= MAX_RISULTATI);
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
    const esito = suggerisci(colture, ({ ...conTerreno(criteriBase, 'limoso'), superficieHa: 500 }));
    const limitate = esito.principali.filter((r) => Number.isFinite(r.coltura.superficie_max_ha));

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
            const esito = suggerisci(colture, { provincia, tessitura: profiloDaClasse(terreno), superficieHa, irrigazione });
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
      tessitura: profiloDaClasse('argilloso'),
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

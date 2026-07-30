/**
 * Tessitura del terreno: triangolo USDA e caratteristiche derivate.
 *
 * L'utente puo indicare il terreno in due modi:
 *
 *  1. scegliendo una delle quattro classi semplificate (argilloso, sabbioso,
 *     limoso, misto) - la via rapida;
 *  2. inserendo le percentuali di sabbia, limo e argilla da un'analisi del
 *     suolo - la via precisa.
 *
 * Nel secondo caso si classifica con il triangolo USDA e si riconduce la classe
 * a una delle quattro semplificate, cosi il motore di compatibilita lavora
 * sempre sullo stesso alfabeto. La classe USDA completa resta pero disponibile
 * e viene mostrata all'utente: chi ha l'analisi del suolo si aspetta di
 * ritrovarcela, e sapere che il proprio terreno e "franco limoso-argilloso" e
 * un'informazione piu utile del generico "argilloso".
 */

export const CLASSI_SEMPLIFICATE = Object.freeze(['argilloso', 'sabbioso', 'limoso', 'misto']);

/**
 * Le 12 classi USDA, con la classe semplificata corrispondente.
 * L'ordine non conta: la classificazione avviene nella cascata piu sotto.
 */
export const CLASSI_USDA = Object.freeze({
  sabbia: { nome: 'Sabbia', semplificata: 'sabbioso' },
  sabbia_franca: { nome: 'Sabbia franca', semplificata: 'sabbioso' },
  franco_sabbioso: { nome: 'Franco sabbioso', semplificata: 'sabbioso' },
  franco: { nome: 'Franco', semplificata: 'misto' },
  franco_limoso: { nome: 'Franco limoso', semplificata: 'limoso' },
  limo: { nome: 'Limo', semplificata: 'limoso' },
  franco_sabbioso_argilloso: { nome: 'Franco sabbioso-argilloso', semplificata: 'misto' },
  franco_argilloso: { nome: 'Franco argilloso', semplificata: 'argilloso' },
  franco_limoso_argilloso: { nome: 'Franco limoso-argilloso', semplificata: 'argilloso' },
  argilla_sabbiosa: { nome: 'Argilla sabbiosa', semplificata: 'argilloso' },
  argilla_limosa: { nome: 'Argilla limosa', semplificata: 'argilloso' },
  argilla: { nome: 'Argilla', semplificata: 'argilloso' },
});

/**
 * Profilo rappresentativo di ogni classe semplificata.
 * Serve nel verso opposto: quando l'utente sceglie il preset invece di inserire
 * le percentuali, il motore ha comunque un profilo con cui ragionare.
 */
export const PROFILI_TIPO = Object.freeze({
  argilloso: { sabbia: 25, limo: 30, argilla: 45 },
  sabbioso: { sabbia: 80, limo: 12, argilla: 8 },
  limoso: { sabbia: 20, limo: 62, argilla: 18 },
  misto: { sabbia: 40, limo: 40, argilla: 20 },
});

/**
 * Classifica secondo il triangolo USDA.
 * @param {number} sabbia percentuale
 * @param {number} limo percentuale
 * @param {number} argilla percentuale
 * @returns {string} chiave di CLASSI_USDA
 */
export function classificaUsda(sabbia, limo, argilla) {
  const S = sabbia;
  const Si = limo;
  const C = argilla;

  // Cascata standard USDA: l'ordine dei rami e vincolante, non e riordinabile.
  if (Si + 1.5 * C < 15) return 'sabbia';
  if (Si + 1.5 * C >= 15 && Si + 2 * C < 30) return 'sabbia_franca';
  if ((C >= 7 && C < 20 && S > 52 && Si + 2 * C >= 30) || (C < 7 && Si < 50 && Si + 2 * C >= 30)) {
    return 'franco_sabbioso';
  }
  if (C >= 7 && C < 27 && Si >= 28 && Si < 50 && S <= 52) return 'franco';
  if (Si >= 80 && C < 12) return 'limo';
  if ((Si >= 50 && C >= 12 && C < 27) || (Si >= 50 && Si < 80 && C < 12)) return 'franco_limoso';
  if (C >= 20 && C < 35 && Si < 28 && S > 45) return 'franco_sabbioso_argilloso';
  if (C >= 27 && C < 40 && S > 20 && S <= 45) return 'franco_argilloso';
  if (C >= 27 && C < 40 && S <= 20) return 'franco_limoso_argilloso';
  if (C >= 35 && S > 45) return 'argilla_sabbiosa';
  if (C >= 40 && Si >= 40) return 'argilla_limosa';
  if (C >= 40) return 'argilla';

  // Il triangolo copre tutto lo spazio valido: se si arriva qui l'input non
  // sommava a 100 ed e gia stato normalizzato, quindi "franco" e il ripiego
  // ragionevole (e il centro del triangolo).
  return 'franco';
}

/**
 * Normalizza e classifica un input di percentuali.
 * Accetta valori che non sommano esattamente a 100 (le analisi del suolo sono
 * spesso arrotondate) e li riporta in scala, purche lo scarto sia contenuto.
 *
 * @returns {{valido:boolean, errore?:string, sabbia?:number, limo?:number,
 *   argilla?:number, classeUsda?:string, nomeUsda?:string, semplificata?:string}}
 */
export function analizzaTessitura(sabbia, limo, argilla) {
  const valori = [sabbia, limo, argilla];
  if (valori.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) {
    return { valido: false, errore: 'Le percentuali di sabbia, limo e argilla devono essere numeri tra 0 e 100.' };
  }

  const somma = valori.reduce((s, v) => s + v, 0);
  if (somma <= 0) {
    return { valido: false, errore: 'Le percentuali di sabbia, limo e argilla non possono essere tutte a zero.' };
  }
  if (Math.abs(somma - 100) > 5) {
    return {
      valido: false,
      errore: `Sabbia, limo e argilla sommano a ${Math.round(somma)}%: devono sommare a 100% (tolleranza 5 punti).`,
    };
  }

  const scala = 100 / somma;
  const S = Math.round(sabbia * scala * 10) / 10;
  const Si = Math.round(limo * scala * 10) / 10;
  const C = Math.round(argilla * scala * 10) / 10;

  const classeUsda = classificaUsda(S, Si, C);

  return {
    valido: true,
    sabbia: S,
    limo: Si,
    argilla: C,
    classeUsda,
    nomeUsda: CLASSI_USDA[classeUsda].nome,
    semplificata: CLASSI_USDA[classeUsda].semplificata,
  };
}

/** Profilo di una classe semplificata, per l'uso senza analisi del suolo. */
export function profiloDaClasse(classe) {
  const profilo = PROFILI_TIPO[classe];
  if (!profilo) return null;
  return { ...profilo, semplificata: classe };
}

/**
 * Note pratiche derivate dalla tessitura: sono le conseguenze agronomiche che
 * l'utente si aspetta di sentirsi dire, e che giustificano perche una coltura
 * viene consigliata o sconsigliata su quel terreno.
 */
export function caratteristicheTessitura({ sabbia, limo, argilla }) {
  const note = [];

  if (argilla >= 40) {
    note.push('Terreno pesante: elevata capacita di ritenzione idrica e di scambio cationico, ma lavorabilita limitata a una finestra di umidita stretta e rischio di asfissia radicale.');
  } else if (argilla >= 27) {
    note.push('Terreno tendenzialmente pesante: buona fertilita potenziale, drenaggio da governare con la sistemazione idraulica.');
  }

  if (sabbia >= 70) {
    note.push('Terreno sciolto: si scalda presto e si lavora sempre, ma trattiene poca acqua e pochi elementi nutritivi. Senza irrigazione la variabilita di resa e alta.');
  } else if (sabbia >= 50) {
    note.push('Terreno tendenzialmente sciolto: buona lavorabilita e drenaggio, moderata capacita di ritenzione.');
  }

  if (limo >= 60) {
    note.push('Prevalenza di limo: rischio di crostone superficiale e di compattamento, da gestire con sostanza organica e con attenzione al transito in campo.');
  }

  if (argilla < 27 && sabbia < 52 && limo < 60) {
    note.push('Tessitura equilibrata: e la condizione che consente il ventaglio colturale piu ampio.');
  }

  return note;
}

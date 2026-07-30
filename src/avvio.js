/**
 * Entry point di produzione. Unico posto che apre una porta.
 */

import { app } from './server.js';
import { getColture, getComuni, getProvince } from './data/index.js';
import { urlAssoluto } from './lib/seo.js';

const porta = process.env.PORT || 3000;

const server = app.listen(porta, () => {
  console.log(`Calcolatore Suolo e Coltura in ascolto su ${urlAssoluto('')}`);
  console.log(`${getColture().length} colture · ${getProvince().length} province · ${getComuni().length} comuni`);
});

// Railway invia SIGTERM ai deploy sostituiti: chiudere in modo pulito evita
// richieste troncate durante il rilascio.
for (const segnale of ['SIGTERM', 'SIGINT']) {
  process.on(segnale, () => {
    console.log(`${segnale} ricevuto, chiusura in corso.`);
    server.close(() => process.exit(0));
  });
}

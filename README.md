# Calcolatore Suolo e Coltura

Calcolatore web che, dato un terreno agricolo veneto (zona, tessitura, superficie,
disponibilita di irrigazione), suggerisce le colture compatibili con una stima
della **PLV** (Produzione Lorda Vendibile) per ettaro e totale, con il range tra
annata buona e annata scarsa.

Copertura v1: le **sette province del Veneto**, con i 50 comuni della provincia di
Rovigo mappati singolarmente.

---

## Stack e perche

| Scelta | Motivo |
|---|---|
| Node.js + Express + EJS | Rendering lato server, **nessun build step**: si modifica un file su GitHub e Railway ridistribuisce. Nessuna installazione locale richiesta. |
| Dataset in JSON versionato | Nessuna query in runtime, quindi pagine veloci; e ogni modifica a un valore di PLV resta in un commit git. Vedi [`docs/fonti-dati.md`](docs/fonti-dati.md). |
| Nessuna dipendenza front-end | Un solo file CSS, nessun font esterno, nessuna richiesta di rete oltre alla pagina. Il vincolo del progetto e la velocita. |

Il dataset viene letto solo attraverso [`src/data/index.js`](src/data/index.js).
Quando servira Postgres — per i lead, le serie storiche prezzi o le query
geografiche AVEPA — si riscrive quel file e non il resto.

---

## Comandi

```bash
npm install
npm start              # avvia su http://localhost:3000
npm run dev            # con ricarica automatica
npm test               # 64 test: dataset, calcolo PLV, matching, rotte e SEO
```

Import dei dati ISTAT:

```bash
npm run import:discover   # ispeziona la struttura del dataflow (da eseguire per primo)
npm run import:rese       # superfici e produzioni -> rese per anno e provincia
npm run import:prezzi     # prezzi dei prodotti agricoli
```

---

## Struttura

```
src/
  avvio.js              unico punto che apre una porta
  server.js             rotte, validazione input, metadati per pagina
  data/
    index.js            strato di accesso ai dati (l'unica cosa da cambiare per Postgres)
    colture.json        dataset curato: agronomia, compatibilita, range di PLV
    province.json       le 7 province venete con inquadramento agronomico
    comuni.json         50 comuni di Rovigo + capoluoghi delle altre province
  lib/
    plv.js              calcolo PLV e percentili sulla serie annuale
    matching.js         filtri rigidi + punteggio di adattamento
    seo.js              canonical, Open Graph, dati strutturati JSON-LD
    format.js           formattazione italiana di valute e numeri
  views/                template EJS
  public/stile.css      foglio di stile unico
scripts/
  import-istat.mjs      importer API SDMX ISTAT
  mappatura-istat.json  slug colture -> codici ISTAT (da compilare con "discover")
docs/
  fonti-dati.md         analisi delle fonti pubbliche italiane per la PLV
test/                   suite di test
```

---

## Rotte

| Percorso | Ruolo |
|---|---|
| `/` | form del calcolatore |
| `/risultato?provincia=…&terreno=…&superficie=…&irrigazione=…` | risultato **condivisibile con link diretto**, reso lato server e indicizzabile |
| `/cosa-coltivare-a/:comune` | landing di comune — intercetta "cosa coltivare a …" |
| `/cosa-coltivare-in/:provincia` | landing di provincia |
| `/colture` e `/colture/:slug` | elenco e schede per coltura, pronte per diventare landing dedicate |
| `/metodologia` | metodo di calcolo, fonti e limiti dichiarati |
| `/sitemap.xml`, `/robots.txt` | 86 URL in sitemap |
| `/salute` | health check per Railway |

Ogni pagina indicizzabile ha `title`, `meta description`, `canonical`, Open Graph
e, dove ha senso, dati strutturati (`ItemList`, `Article`, `FAQPage`). La suite di
test lo verifica pagina per pagina, cosi una modifica ai template non puo
rompere il SEO in silenzio.

---

## Deploy su Railway (workflow da browser)

1. Nuovo progetto Railway → **Deploy from GitHub repo** → questo repository.
2. Railway rileva Node.js da `package.json` e usa `npm start`. Nessuna
   configurazione di build necessaria.
3. Variabili d'ambiente:

   | Variabile | Valore |
   |---|---|
   | `NODE_ENV` | `production` (attiva la cache lunga sugli asset statici) |
   | `PUBLIC_BASE_URL` | il dominio pubblico, es. `https://tuodominio.it` |

   `PUBLIC_BASE_URL` serve perche `canonical`, Open Graph e sitemap devono
   contenere URL assolute corrette. In sua assenza si usa
   `RAILWAY_PUBLIC_DOMAIN`.
4. `PORT` la fornisce Railway: non impostarla a mano.

Da qui il ciclo di lavoro e interamente da browser: modifica su GitHub → commit →
Railway ridistribuisce.

---

## Stato dei dati

I valori di PLV attualmente in uso sono in prevalenza **stime di inquadramento**
(`stima_esperto`), non ancora ricalcolate sulle serie ISTAT. Ogni coltura dichiara
il proprio livello di affidabilita, mostrato nell'interfaccia:

- `istat` — resa da `DCSP_COLTIVAZIONI` e prezzo da `DCSP_PREZZIAGR`, riproducibile
- `stima_esperto` — inquadramento da esperienza di settore e letteratura tecnica
- `sperimentale` — nessun dato pubblico italiano disponibile (lenticchia d'acqua, luffa)

Il passaggio a `istat` avviene popolando `serie_annuale` in `colture.json` tramite
gli importer: da quel momento `src/lib/plv.js` calcola il range con i percentili
sulla serie di PLV annuali invece di usare il range curato.

### Nota metodologica sul range

Il range annata buona / scarsa **non** si ottiene moltiplicando la resa peggiore
per il prezzo peggiore: resa e prezzo sono negativamente correlati, e quel prodotto
descrive uno scenario mai verificatosi. Si calcola la PLV di ogni singolo anno e si
prendono i percentili di quella serie. Dettagli in `src/lib/plv.js` e su
`/metodologia`.

---

## Avvertenza

Le stime sono indicative su base statistica e non sostituiscono una valutazione
agronomica. **La PLV non e il reddito**: non sottrae i costi di produzione, che tra
colture cambiano molto, e non include i contributi PAC.

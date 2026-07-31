# Calcolatore Suolo e Coltura

Calcolatore web che, dato un terreno agricolo veneto (zona, tessitura, superficie,
disponibilita di irrigazione), suggerisce le colture compatibili con una stima
della **PLV** (Produzione Lorda Vendibile) e del **margine lordo** per ettaro,
con il range tra annata buona e annata scarsa.

Copertura: le **sette province del Veneto**, 83 colture (cereali, oleaginose,
industriali, foraggere, orticole e frutta), con i 50 comuni della provincia di
Rovigo mappati singolarmente.

Le **rese vengono da ISTAT** (dataflow `101_1015`, `DCSP_COLTIVAZIONI`); i prezzi
sono ancora stime di settore. Ogni coltura dichiara in interfaccia la provenienza
del proprio dato.

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
npm test               # 108 test: dataset, PLV, tessitura, matching, rotte e SEO
```

Aggiornare i dati:

```bash
npm run importa:rese     # export DCSP_COLTIVAZIONI -> istat-veneto.json (rese e superfici)
npm run importa:prezzi   # export DCSP_PREZZIAGR   -> istat-prezzi.json (indice e volatilita)
npm run costruisci       # unisce tutto con la tabella curata -> src/data/colture.json
```

Il ciclo e sempre questo: si scarica un nuovo export dal databrowser ISTAT, lo si
mette in `src/data/raw/`, si lanciano i tre comandi e si committa il risultato.

Per correggere un prezzo o un requisito agronomico si modifica la **tabella
curata** in `scripts/costruisci-colture.mjs` e si rilancia `npm run costruisci`.

---

## Struttura

```
src/
  avvio.js              unico punto che apre una porta
  server.js             rotte, validazione input, metadati per pagina
  data/
    index.js              strato di accesso ai dati (l'unica cosa da cambiare per Postgres)
    colture.json          GENERATO: agronomia + rese ISTAT + PLV
    istat-veneto.json     GENERATO: rese e superfici importate da ISTAT
    province.json         le 7 province venete con inquadramento agronomico
    comuni.json           50 comuni di Rovigo + capoluoghi delle altre province
    raw/                  export CSV scaricati da ISTAT
  lib/
    plv.js                calcolo PLV, percentili e coefficiente di variabilita
    matching.js           filtri rigidi + punteggio di adattamento
    tessitura.js          triangolo USDA e caratteristiche del suolo
    seo.js                canonical, Open Graph, dati strutturati JSON-LD
    format.js             formattazione italiana di valute e numeri
  views/                  template EJS
  public/stile.css        foglio di stile unico
scripts/
  importa-istat-csv.mjs   export CSV del databrowser ISTAT -> istat-veneto.json
  costruisci-colture.mjs  TABELLA CURATA + rese ISTAT -> colture.json
  import-istat.mjs        importer via API SDMX (alternativa all'export manuale)
docs/
  fonti-dati.md           analisi delle fonti pubbliche italiane per la PLV
test/                     suite di test
```

---

## SEO e velocita

| Intervento | Effetto |
|---|---|
| Rendering lato server, nessun build step | Il contenuto indicizzabile e nel primo byte |
| Compressione gzip | Pagina risultato da 78 KB a 10,5 KB |
| Un solo CSS, nessun font o script esterno | Nessuna richiesta di rete oltre alla pagina |
| `title`, `description`, `canonical`, Open Graph per pagina | Verificati dai test, pagina per pagina |
| JSON-LD: `WebSite`, `BreadcrumbList`, `FAQPage`, `Article`, `ItemList` | Percorso al posto della URL nei risultati, FAQ in rich snippet |
| FAQ generate sui dati reali della zona | Intercettano "quanto rende un ettaro a…", "cosa coltivare a…" |
| `Disallow: /risultato?` in robots.txt | Il crawl budget va sulle landing, non sulla combinatoria dei parametri |
| Sitemap con `lastmod` e `priority` | 149 URL, priorita piu alta alle landing di zona e coltura |
| Cache-Control differenziato | 30 giorni sugli asset, 1 giorno sulle landing |

## Rotte

| Percorso | Ruolo |
|---|---|
| `/` | form del calcolatore |
| `/risultato?provincia=…&terreno=…&superficie=…&irrigazione=…` | risultato **condivisibile con link diretto**, reso lato server e indicizzabile |
| `/cosa-coltivare-a/:comune` | landing di comune — intercetta "cosa coltivare a …" |
| `/cosa-coltivare-in/:provincia` | landing di provincia |
| `/colture` e `/colture/:slug` | elenco e schede per coltura, pronte per diventare landing dedicate |
| `/metodologia` | metodo di calcolo, fonti e limiti dichiarati |
| `/sitemap.xml`, `/robots.txt` | 149 URL in sitemap |
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

## Parametri del terreno

Oltre alla classe di tessitura, il calcolatore accetta i dati di un'analisi del
suolo. Tutti facoltativi: **un parametro non compilato non penalizza nessuna
coltura**.

| Parametro | Effetto |
|---|---|
| Sabbia / limo / argilla (%) | Classificazione con il **triangolo USDA** (12 classi), ricondotta alle 4 classi semplificate |
| pH | Il piu selettivo: fuori tolleranza esclude, fuori dall'ottimale segnala |
| Salinita | Con salinita elevata esclude le colture poco tolleranti — rilevante nel Delta |
| Calcare attivo | Segnala il rischio di clorosi ferrica sulle arboree sensibili |
| Drenaggio | Con drenaggio lento esclude gli impianti poliennali che richiedono suolo drenato |

## Come vengono ordinate le colture

L'ordinamento non premia la coltura piu diffusa ma la migliore opportunita, e si
regge su tre termini:

| Termine | Ruolo |
|---|---|
| **Margine lordo €/ha** | PLV meno costi. E il numero che conta per decidere, non la PLV |
| **Margine €/ora di lavoro** | Il correttivo: senza, in cima finiscono fragola e peperone, che su 20 ha nessuno gestisce |
| **Confidenza statistica** | Una resa ISTAT su 23 ha e rumore, su 140.000 ha e un dato: la superficie regionale scala i termini economici |

La diffusione resta con peso ridotto, come segnale di accesso al mercato
(filiere, contoterzisti, acquirenti gia disponibili).

Oltre ai parametri del suolo il form accetta due **vincoli d'impresa**:
manodopera disponibile (esclude le colture oltre le ore/ha sostenibili) e
orizzonte di investimento (esclude gli impianti pluriennali). Sono spesso il
vincolo che decide davvero.

Le schede in dettaglio sono 8, ma **tutte** le colture ammesse restano visibili
nella tabella di confronto: nascondere 60 opzioni dietro un top-5 non guida
nessuna scelta.

## Stato dei dati

- `istat` — resa e prezzo entrambi rilevati. **Nessuna coltura ha ancora questo
  livello**: i prezzi restano stime.
- `istat_resa` — resa da `DCSP_COLTIVAZIONI`, prezzo da stima di settore.
- `stima_esperto` — nessuna rilevazione ISTAT per quella coltura.

I **costi di produzione** sono la parte piu debole del modello: stime di
inquadramento, per l'ortofrutta espresse come quota tipica della PLV perche
manodopera di raccolta e confezionamento scalano con i chilogrammi. Due test di
guardrail impediscono che una modifica futura produca valori assurdi: il rapporto
costi/PLV deve restare tra 0,30 e 0,95 e il margine orario sotto i 150 €/h — e
stato quel controllo a far emergere la canapa, dove la resa ISTAT era in biomassa
e il prezzo era quello del seme.

### Nota metodologica sul range

Il range annata buona / scarsa **non** si ottiene moltiplicando la resa peggiore
per il prezzo peggiore: resa e prezzo sono negativamente correlati, e quel
prodotto descrive uno scenario mai verificatosi.

Il metodo corretto - percentili sulla serie di PLV annuali - richiede almeno 5
annate di rese. L'export ISTAT ne copre 2, quindi il range si costruisce con un
**coefficiente di variabilita applicato alla PLV**, non separatamente a resa e
prezzo: applicandolo al prodotto si evita per costruzione l'errore di
correlazione.

Quel coefficiente non e piu dichiarato a occhio: combina la **volatilita del
prezzo misurata** sull'indice ISTAT con una variabilita di resa stimata per
categoria, con un fattore 0,85 che incorpora la correlazione negativa.
`src/lib/plv.js` implementa entrambi i metodi e passa ai percentili appena la
serie di rese e abbastanza lunga.

### Prossimo passo sui dati

1. **Serie di rese piu lunga** (2015-2024 invece di 2025-2026): fa scattare il
   metodo dei percentili, gia implementato.
2. **Prezzi assoluti in €/q**: l'indice ISTAT non li contiene. Vanno da ISMEA
   (banca dati prezzi all'origine, export manuale) o da contabilita aziendale.
   E l'ultimo anello ancora stimato della catena PLV.
3. **Costi di produzione** validati su RICA o su contabilita reali.

---

## Avvertenza

Le stime sono indicative su base statistica e non sostituiscono una valutazione
agronomica. **La PLV non e il reddito**: non sottrae i costi di produzione, che tra
colture cambiano molto, e non include i contributi PAC.

# Fonti dati per PLV per coltura / zona — analisi preliminare

Documento di lavoro, fase 0 del progetto (prima dello scaffold).
Obiettivo: capire con quali dati pubblici italiani si può calcolare una PLV
(Produzione Lorda Vendibile) media per ettaro credibile, partendo dal
Polesine / Veneto.

---

## 1. Il punto di partenza: la PLV per coltura/zona non esiste come dataset

Non c'è una fonte pubblica italiana che pubblichi "PLV per coltura per zona" in
forma scaricabile e aggiornata. Esistono aggregati di PLV a livello di comparto
e di regione (es. il valore della produzione agricola veneta, ~8,5 mld € nel
2025), ma non la PLV per ettaro di mais in provincia di Rovigo.

Questo però non è un problema, perché la PLV è per definizione un prodotto di
due grandezze che *sono* pubbliche e disponibili separatamente:

```
PLV (€/ha) = resa (q/ha) × prezzo (€/q)
```

La strategia corretta quindi non è cercare la PLV, ma **comporla da due fonti
distinte**: una fonte rese e una fonte prezzi. Questo ha tre vantaggi concreti:

1. ogni numero mostrato all'utente è tracciabile a una fonte citabile;
2. il range "annata buona / annata scarsa" emerge dai dati storici reali,
   non da un'assunzione inventata;
3. si aggiornano indipendentemente (i prezzi cambiano ogni settimana, le rese
   una volta all'anno).

**Nota metodologica.** La PLV in senso stretto **non include** i contributi PAC
(BPS, ecoschemi, pagamenti accoppiati). Per colture come mais e soia in Veneto
i pagamenti PAC sono una quota rilevante della redditività effettiva, quindi
conviene tenerli come voce separata e opzionale, mai fusa nella PLV.

---

## 2. Le fonti, valutate una per una

### 2.1 ISTAT — Coltivazioni (superfici e produzioni) → **fonte RESE, pilastro della v1**

| | |
|---|---|
| Dataflow | `101_1015` — "Coltivazioni", struttura `DCSP_COLTIVAZIONI` |
| Contenuto | superficie totale, superficie in produzione, produzione totale, produzione raccolta |
| Granularità | per coltura, **per provincia**, annuale |
| Accesso | SDMX REST API (`esploradati.istat.it/SDMXWS/rest/...`), + databrowser con export CSV |
| Licenza | CC-BY (obbligo di citazione), riutilizzo commerciale ammesso |
| Verdetto | **la fonte migliore che abbiamo.** Vera API, gratuita, provinciale, storica |

È la fonte da cui ricaviamo la resa per Rovigo:

```
resa (q/ha) = produzione raccolta / superficie in produzione
```

Averla per provincia e per anno è esattamente ciò che serve: dà sia il valore
centrale sia la variabilità storica.

Dataflow ISTAT collegati e utili:

- `101_12` — `DCSP_PREZZIAGR`, prezzi dei prodotti agricoli
- `101_148` — `DCSP_RICAREA`, risultati economici delle aziende agricole
- `102_974` — `DCSP_SPA`, struttura delle aziende agricole
- `93_48` — `DCCN_VAAGSIPET`, conti della branca agricoltura

Per l'accesso alle API esiste documentazione di terze parti molto migliore di
quella ufficiale: il progetto [`ondata/guida-api-istat`](https://github.com/ondata/guida-api-istat)
mantiene l'elenco completo dei dataflow e gli esempi di query REST.

### 2.2 ISMEA Mercati — banca dati prezzi → **fonte PREZZI, ma con attrito**

Contiene i prezzi rilevati alla produzione (mercati all'origine) e all'ingrosso,
per prodotto/varietà e per piazza di scambio, con serie storiche settimanali.
Per i cereali e la soia le piazze di riferimento del Nord-Est sono utilizzabili
direttamente per il Polesine.

Limiti da mettere in conto:

- **non ha una API pubblica documentata.** L'accesso è via pannello web con
  drill-down e export (xls, csv, pdf). Quindi l'import è manuale o
  semi-automatizzato, non un job schedulato affidabile.
- i **termini d'uso vanno verificati prima di ridistribuire** i dati grezzi.
  Mostrare un prezzo elaborato con citazione della fonte è una cosa; ripubblicare
  la serie storica è un'altra. Da chiarire prima di andare in produzione.

Verdetto: **fonte prezzi di riferimento, ma in v1 la trattiamo come import
manuale periodico**, non come integrazione live.

### 2.3 CREA — RICA → **validazione e costi, non alimentazione automatica**

Due livelli di accesso, molto diversi:

- **AREA RICA** (`arearica.crea.gov.it`) — pubblico. Variabili strutturali,
  patrimoniali ed economiche aggregate per localizzazione e tipologia aziendale,
  più dati tecnico-economici per coltura. Utile per un ordine di grandezza dei
  **costi** e per verificare che le nostre PLV non siano fuori scala.
- **Banca Dati RICA** (`bancadatirica.crea.gov.it`) — microdati anonimizzati,
  accesso gratuito ma **solo previo accreditamento** e limitato a finalità di
  ricerca scientifica. Non utilizzabile per un prodotto web commerciale.

Esiste anche una pubblicazione specifica "I risultati economici delle aziende
agricole venete" basata su banca dati RICA, in PDF: buona come benchmark di
sanity-check.

Verdetto: **non alimenta il calcolatore**, ma serve per validare i numeri e —
se in futuro vuoi mostrare il margine e non solo la PLV — per i costi.

### 2.4 AVEPA — piani colturali per provincia → **il jolly per il Polesine**

Questa è la sorpresa interessante della ricerca. AVEPA pubblica come open data i
**piani colturali validati, per campagna e per provincia**, incluso
"piani colturali 2024 — provincia di Rovigo", pubblicato anche su
`data.europa.eu`. Formato: shapefile ESRI, basato sui Nuovi Piani di Riferimento
(dal 2021 non più particelle catastali).

Non contiene prezzi né PLV. Contiene una cosa diversa e per certi aspetti più
preziosa: **cosa viene effettivamente coltivato, dove, su quanti ettari.**

Due usi concreti:

1. **validazione empirica del motore di suggerimento.** Se il calcolatore
   suggerisce una coltura che in quel comune nessuno coltiva su 1.500 ha, è un
   segnale che l'algoritmo sbaglia — o che hai trovato una nicchia vera. In
   entrambi i casi è informazione.
2. **contenuto SEO generato con dati reali.** Pagine tipo "cosa si coltiva a
   Adria: 2.100 ha di mais, 1.400 di soia, ..." sono esattamente il tipo di
   pagina che intercetta ricerche locali e che nessun competitor ha, perché
   nessuno si prende la briga di processare gli shapefile AVEPA.

Verdetto: **non serve per la PLV, ma è probabilmente l'asset SEO più forte del
progetto.** Da tenere fuori dalla v1 per non allargare lo scope, ma da non
perdere di vista.

### 2.5 Regione Veneto / Veneto Agricoltura → contesto e benchmark

- **Sistema Statistico Regionale** (`statistica.regione.veneto.it`) — banche dati
  economia/agricoltura, dati regionali e provinciali.
- **Rapporto annuale sulla congiuntura del settore agroalimentare veneto**
  (Veneto Agricoltura) — PDF annuale, valore della produzione per comparto e
  dinamica prezzi/quantità. Non machine-readable, ma è il documento con cui
  confrontare i nostri aggregati e da citare.
- **PIAVe** (`piave.veneto.it`) — schede per comparto (seminativi e colture
  industriali) con inquadramento agronomico.

### 2.6 Emilia-Romagna — modello metodologico

La Regione Emilia-Romagna pubblica sistematicamente la PLV per comparto con
metodologia esplicita ("Agricoltura in cifre — Produzione Lorda Vendibile").
Non copre il Veneto, ma **è il riferimento su come si calcola una PLV in modo
difendibile.** Vale la pena allinearsi alla loro metodologia: se un agronomo
contesta i nostri numeri, poter dire "stesso metodo della Regione
Emilia-Romagna" è una posizione solida.

### 2.7 Colture di nicchia (Lemna minor, luffa) → **nessun dato pubblico, punto**

Verificato: per la lenticchia d'acqua non esistono dati agronomico-economici
pubblici utilizzabili per l'Italia. La letteratura disponibile discute la
biomassa in chiave bioenergetica e ammette esplicitamente che la produttività
industriale alle nostre latitudini è un'incognita. Per la luffa la situazione è
analoga o peggiore.

Questo **non è un motivo per escluderle** — al contrario, sono il differenziale
competitivo del progetto e l'area dove la tua esperienza diretta vale più di
qualunque dataset. Ma richiede una scelta di design onesta:

> ogni coltura nel dataset porta un **livello di affidabilità del dato**
> (`istat` / `stima_esperto` / `sperimentale`), esposto nell'interfaccia.

Serve a tre cose: credibilità verso l'utente esperto, protezione da contestazioni,
e — non secondario per il SEO — è esattamente il tipo di trasparenza che Google
premia come segnale di esperienza diretta (E-E-A-T). Una pagina che dice "questo
è un dato sperimentale basato su esperienza diretta nel Delta del Po" è più
forte, non più debole, di una che finge una precisione che non ha.

---

## 3. Come ricavare il range "annata buona / annata scarsa"

Il requisito MVP chiede un range, non un numero secco. Con ISTAT questo si
ottiene dai dati, senza inventare percentuali.

L'approccio **sbagliato** ma tentante:

```
PLV_scarsa = resa_p20 × prezzo_p20
PLV_buona  = resa_p80 × prezzo_p80
```

Sbagliato perché resa e prezzo sono **negativamente correlati**: l'annata di
siccità che dimezza la resa è la stessa che fa salire il prezzo. Moltiplicare i
due percentili peggiori tra loro produce uno scenario che storicamente non si è
mai verificato, e un range assurdamente largo.

L'approccio corretto:

1. per ogni anno `y` della serie (es. 2015–2024) calcola la PLV effettiva di
   quell'anno: `PLV_y = resa_y × prezzo_y`
2. prendi i percentili **della serie di PLV annuali**: p20 = annata scarsa,
   mediana = tipica, p80 = annata buona

La correlazione negativa è già dentro i dati, quindi il range risulta
realisticamente più stretto e difendibile. Come effetto collaterale utile,
questo dà anche materiale editoriale: "negli ultimi 10 anni la PLV del mais in
Polesine ha oscillato tra X e Y €/ha" è una frase che vale una pagina.

---

## 4. Postgres o JSON statico?

**Raccomandazione: JSON versionato in repo per la v1. Postgres quando arrivano i
lead, non prima.**

Il dataset v1 è nell'ordine di 20–40 righe curate a mano, che cambiano poche
volte all'anno. Contro questo profilo, il JSON in repo vince su ogni criterio
che conta per gli obiettivi dichiarati del progetto:

- **velocità** — il vincolo è il SEO, e con il dataset in memoria non c'è nessuna
  query in runtime. Nessun round-trip al DB, nessun connection pool da scaldare,
  nessun cold start che peggiora il TTFB. Le pagine possono essere generate
  staticamente.
- **costo e superficie operativa** — nessun addon Postgres su Railway, nessuna
  migrazione, nessun backup da gestire per dati che stanno in un file.
- **audit trail delle fonti, che qui è il punto centrale.** I numeri di PLV
  saranno contestati da gente competente (colleghi, agronomi, consulenti). Avere
  ogni modifica a ogni valore in un commit git — con chi, quando e perché — è
  un vantaggio che un DB non ti dà gratis. Il versionamento del dataset *è* parte
  del prodotto.

Postgres diventa la scelta giusta quando compare almeno una di queste, e sono
tutte cose che nella roadmap ci sono ma non nella v1:

- **lead generation** (il modello di monetizzazione: contatti verso consulenti e
  fornitori) → dati utente, che in un file JSON non ci vanno;
- **serie storiche prezzi importate** da ISMEA, che sono migliaia di righe e
  vanno interrogate per intervalli;
- **query geografiche vere** su AVEPA (PostGIS, "quali colture entro 10 km");
- analytics sulle ricerche degli utenti — che tra l'altro è il dato più
  monetizzabile del progetto, perché ti dice *cosa cerca* la gente.

Conseguenza pratica per lo scaffold: il dataset va letto attraverso un piccolo
strato di accesso ai dati (una funzione `getColture(criteri)`), non con
`import dataset.json` sparso nei template. Così la migrazione a Postgres, quando
serve, cambia un file e non tutto il progetto.

---

## 5. Pipeline di import proposta

```
scripts/
  import-istat-rese.mjs     # SDMX REST → rese per coltura/provincia/anno
  import-prezzi-ismea.mjs   # CSV scaricato a mano → serie prezzi normalizzata
  build-plv.mjs             # rese × prezzi → percentili → dataset finale
data/
  raw/                      # scaricati, non modificati a mano
  colture.json              # dataset curato: agronomia, terreno, irrigazione
  plv.json                  # generato da build-plv, con fonte e data
```

Principio: `data/raw/` e i file generati sono riproducibili; `colture.json` è
il pezzo curato a mano, quello dove sta il tuo valore aggiunto.

**Vincolo dell'ambiente da tenere presente:** in questo ambiente remoto la
network policy blocca `istat.it` e `data.europa.eu` (403 al gateway). Gli
importer si possono scrivere e testare con fixture, ma il primo download va
fatto da te (browser o Railway) oppure allargando la policy dell'environment.

---

## 6. Avvertenza da mettere nel prodotto

La PLV non è il reddito. Il mais ha PLV alta e margine sottile; una nicchia può
avere PLV bassa e marginalità molto migliore. Un utente che cerca "cosa
coltivare" e legge solo la PLV riceve un segnale fuorviante.

Non serve risolverlo in v1 con un conto economico completo, ma serve:

- un disclaimer chiaro ("stime indicative su base statistica, non sostituiscono
  una valutazione agronomica");
- data e fonte visibili accanto a ogni numero;
- in roadmap, i costi indicativi da RICA per passare da PLV a margine lordo —
  che è anche l'aggancio naturale verso la lead generation ("vuoi una
  valutazione sulla tua azienda?").

---

## Fonti

- ISTAT — [Coltivazioni, superfici e produzione](http://dati.istat.it/Index.aspx?DataSetCode=DCSP_COLTIVAZIONI) · [nota metodologica](https://www.istat.it/it/archivio/267404) · [7° Censimento Agricoltura](https://www.istat.it/statistiche-per-temi/censimenti/agricoltura/7-censimento-generale/risultati/)
- [ISTAT SDMX RESTful API](https://developers.italia.it/it/api/istat-sdmx-rest.html) · [ondata/guida-api-istat](https://github.com/ondata/guida-api-istat) · [elenco dataflow](https://datiistat.it/alldataflows)
- ISMEA Mercati — [banca dati prezzi all'origine](https://www.ismeamercati.it/prezzi-agroalimentari/origine/banca-dati) · [prezzi all'ingrosso](https://www.ismeamercati.it/prezzi-agroalimentari/ingrosso/banca-dati) · [banca dati indici](https://www.ismeamercati.it/dati-agroalimentare/banca-dati-indici) · [dati produzione](https://www.ismeamercati.it/dati-agroalimentare/produzione)
- CREA RICA — [accesso ai dati](https://rica.crea.gov.it/accesso-ai-dati-della-rica-italiana-845.php) · [AREA RICA](https://arearica.crea.gov.it/) · [Banca Dati RICA](https://bancadatirica.crea.gov.it/) · [risultati economici aziende venete](https://rica.crea.gov.it/download.php?id=1751)
- AVEPA — [uso del suolo](https://www.avepa.it/servizi/servizi/uso-del-suolo) · [Piano Colturale Grafico](https://www.avepa.it/piano-colturale-grafico-pcg) · [piani colturali 2024 prov. Rovigo](https://data.europa.eu/data/datasets/avepa-000034-20241211-101418?locale=it)
- Regione Veneto — [Sistema Statistico Regionale, agricoltura](https://statistica.regione.veneto.it/banche_dati_economia_agricoltura.jsp) · [PIAVe seminativi e colture industriali](https://www.piave.veneto.it/web/temi/seminativi-e-colture-industriali) · [Open Data Veneto](https://dati.veneto.it/) · [bilancio annata agraria 2025](https://www.regione.veneto.it/article-detail?articleId=14327283)
- Regione Emilia-Romagna — [Produzione Lorda Vendibile, metodologia](https://agricoltura.regione.emilia-romagna.it/agricoltura-in-cifre/produzione-lorda-vendibile-plv)
- Lemna — [AgroNotizie, produttività della lenticchia d'acqua](https://agronotizie.imagelinenetwork.com/bio-energie-rinnovabili/2014/07/07/la-lenticchia-d-acqua-e-davvero-un-concentrato-di-bioenergia/38952)

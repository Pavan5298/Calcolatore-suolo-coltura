#!/usr/bin/env node
/**
 * Genera src/data/colture.json unendo:
 *
 *   - la TABELLA CURATA qui sotto (agronomia, pH, tolleranze, prezzi)
 *   - le rese reali importate da ISTAT (src/data/istat-veneto.json)
 *
 * QUESTA TABELLA E LA SORGENTE EDITABILE DEL DATASET. Per correggere un prezzo o
 * un requisito agronomico si modifica qui e si rilancia `npm run costruisci`.
 * Il JSON generato viene comunque committato, cosi ogni modifica a un valore
 * resta tracciata in git e l'applicazione non deve rigenerare nulla all'avvio.
 *
 * LEGENDA DEI CAMPI COMPATTI
 *   s    slug (URL)
 *   n    nome, sci nome scientifico
 *   i    codice ISTAT TYPE_OF_CROP (null se la coltura non e rilevata da ISTAT)
 *   c    categoria
 *   t    tessiture compatibili   A argilloso  S sabbioso  L limoso  M misto
 *   o    tessiture ottimali (stesso alfabeto)
 *   irr  irrigazione   N non necessaria  C consigliata  R necessaria
 *   alt  altimetria    P pianura  C collina  M montagna
 *   pv   province: '*' tutte, '*-BL' tutte tranne Belluno, oppure elenco 'VR,VI'
 *   ph   [minimo, ottimale_min, ottimale_max, massimo]
 *   sal  tolleranza alla salinita        B bassa  M media  A alta
 *   cal  sensibilita al calcare attivo   B bassa  M media  A alta
 *   dre  drenaggio richiesto  B buono  M medio  T tollera il ristagno
 *   min  superficie minima indicativa (ha)
 *   max  superficie massima realistica (ha), null = nessun limite pratico
 *   p    prezzo alla produzione [scarso, tipico, buono] in euro/quintale
 *   r    resa stimata [scarsa, tipica, buona] q/ha - usata SOLO senza codice ISTAT
 *   cic  ciclo  A annuale  P poliennale
 *   v    coefficiente di variabilita della PLV (vedi src/lib/plv.js)
 *   aff  affidabilita forzata (default: 'istat' con codice ISTAT, altrimenti 'stima_esperto')
 *   nt   nota agronomica
 *   av   avvertenze
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Variabilita tipica della PLV per categoria, usata per costruire il range
// annata scarsa / buona finche non c'e una serie storica di almeno 5 anni.
const VARIABILITA = {
  cereali: 0.3,
  'oleaginose e proteiche': 0.3,
  'colture industriali': 0.28,
  foraggere: 0.25,
  orticole: 0.4,
  frutta: 0.35,
  'colture di nicchia': 0.55,
};

/* eslint-disable */
const TABELLA = [
// ---------------------------------------------------------------- cereali
{s:'mais',n:'Mais da granella',sci:'Zea mays',i:'MAIZE',c:'cereali',t:'ALMS',o:'LM',irr:'C',alt:'P',pv:'*-BL',ph:[5.5,6,7.5,8.2],sal:'M',cal:'M',dre:'B',min:2,max:null,p:[18,22,28],cic:'A',nt:'La coltura di riferimento della pianura veneta. Senza irrigazione la resa crolla nelle annate siccitose.',av:['Margine sottile rispetto alla PLV: costi elevati per seme, azoto ed essiccazione.']},
{s:'frumento-tenero',n:'Frumento tenero',sci:'Triticum aestivum',i:'COMMEAT',c:'cereali',t:'ALM',o:'AL',irr:'N',alt:'PC',pv:'*',ph:[5.5,6,7.5,8.3],sal:'M',cal:'B',dre:'M',min:2,max:null,p:[19,23,29],cic:'A',nt:'Ciclo autunno-vernino: sfrutta le piogge invernali e non richiede irrigazione, distribuendo il rischio climatico su un calendario diverso dalle colture primaverili.',av:['Il prezzo dipende molto dalla classe qualitativa e dal contenuto proteico.']},
{s:'frumento-duro',n:'Frumento duro',sci:'Triticum durum',i:'WHEATD',c:'cereali',t:'ALM',o:'AL',irr:'N',alt:'PC',pv:'*-BL',ph:[6,6.5,7.8,8.3],sal:'M',cal:'B',dre:'M',min:2,max:null,p:[22,27,34],cic:'A',nt:'Piu esigente del tenero in fertilita e piu sensibile alle piogge in raccolta, ma spunta un prezzo superiore se raggiunge i parametri di qualita per la pasta.',av:['In Veneto il rischio di declassamento per basso tenore proteico o bianconatura e concreto.']},
{s:'orzo',n:'Orzo',sci:'Hordeum vulgare',i:'BARLEY',c:'cereali',t:'SLMA',o:'MS',irr:'N',alt:'PCM',pv:'*',ph:[6,6.5,8,8.5],sal:'A',cal:'B',dre:'M',min:1,max:null,p:[18,21,26],cic:'A',nt:'Piu rustico del frumento e piu tollerante ai terreni sciolti e alla salinita. Raccolta precoce, quindi libera il campo per una seconda coltura.',av:['Mal tollera i suoli acidi: sotto pH 6 la resa cala sensibilmente.']},
{s:'riso',n:'Riso',sci:'Oryza sativa',i:'RICE',c:'cereali',t:'AL',o:'A',irr:'R',alt:'P',pv:'VR,VE,PD,RO',ph:[5,5.5,7,8],sal:'M',cal:'B',dre:'T',min:3,max:null,p:[28,35,48],cic:'A',nt:'Concentrato nel comprensorio veronese e in alcune aree della bassa. Richiede terreni impermeabili e disponibilita idrica continua, non semplice irrigazione di soccorso.',av:["Serve un diritto d'acqua e una sistemazione idraulica dedicata: non e una coltura in cui si entra in una sola stagione."]},
{s:'sorgo-da-granella',n:'Sorgo da granella',sci:'Sorghum bicolor',i:'SORGH',c:'cereali',t:'ALMS',o:'MA',irr:'N',alt:'P',pv:'*-BL',ph:[5.5,6,7.8,8.5],sal:'A',cal:'M',dre:'M',min:2,max:null,p:[17,20,25],cic:'A',nt:'Il sostituto del mais in asciutto: consumi idrici molto inferiori a parita di destinazione zootecnica, e buona tolleranza alla salinita.',av:['Mercato meno liquido del mais: verificare lo sbocco commerciale prima di seminare.']},
{s:'triticale',n:'Triticale',sci:'x Triticosecale',i:'TITICALE',c:'cereali',t:'SLMA',o:'MS',irr:'N',alt:'PCM',pv:'*',ph:[5,5.5,7.5,8.2],sal:'M',cal:'B',dre:'M',min:1,max:null,p:[17,20,25],cic:'A',nt:'Ibrido tra frumento e segale: rustico, adatto ai terreni marginali e poco fertili, destinato soprattutto alla zootecnia.',av:[]},
{s:'avena',n:'Avena',sci:'Avena sativa',i:'OATS',c:'cereali',t:'SLM',o:'MS',irr:'N',alt:'PCM',pv:'*',ph:[5,5.5,7,7.8],sal:'B',cal:'B',dre:'M',min:1,max:null,p:[19,23,29],cic:'A',nt:'Tollera bene i suoli acidi e le annate fresche. Buona coltura da rottura e da copertura, con mercato in crescita per uso alimentare umano.',av:[]},
{s:'segale',n:'Segale',sci:'Secale cereale',i:'RYE',c:'cereali',t:'SM',o:'SM',irr:'N',alt:'CM',pv:'BL,VI,VR,TV',ph:[4.5,5,7,7.5],sal:'M',cal:'B',dre:'M',min:0.5,max:null,p:[19,23,30],cic:'A',nt:'Cereale rustico da quota: tollera suoli poveri, acidi e il freddo. Interessante per filiere locali di panificazione, dove il prezzo si stacca dalla commodity.',av:['Superfici regionali molto ridotte: il dato statistico e fragile.']},
{s:'grano-saraceno',n:'Grano saraceno',sci:'Fagopyrum esculentum',i:'BUCKWHEAT',c:'cereali',t:'SM',o:'SM',irr:'N',alt:'CM',pv:'BL,VI,VR',ph:[5,5.5,7,7.5],sal:'B',cal:'M',dre:'B',min:0.5,max:60,p:[70,95,130],cic:'A',nt:'Non e un cereale ma uno pseudocereale: ciclo brevissimo (70-90 giorni), adatto come coltura da rinnovo in montagna. Prezzo molto superiore ai cereali veri, resa molto inferiore.',av:['Resa bassa e instabile: sensibile a caldo e siccita in fioritura.','Mercato di nicchia legato alle filiere locali.']},
// -------------------------------------------------- oleaginose e proteiche
{s:'soia',n:'Soia',sci:'Glycine max',i:'SOYA',c:'oleaginose e proteiche',t:'ALM',o:'LA',irr:'C',alt:'P',pv:'*-BL',ph:[5.5,6,7,7.8],sal:'B',cal:'A',dre:'M',min:2,max:null,p:[38,45,58],cic:'A',nt:'Il Veneto e la prima regione italiana per soia. Azotofissatrice e ottima precessione per i cereali: il valore agronomico in rotazione non compare nella PLV ma esiste.',av:['Sensibile alla clorosi ferrica sui terreni calcarei.']},
{s:'girasole',n:'Girasole',sci:'Helianthus annuus',i:'SUNFLO',c:'oleaginose e proteiche',t:'SML',o:'MS',irr:'N',alt:'PC',pv:'*-BL',ph:[5.5,6,7.5,8.2],sal:'M',cal:'M',dre:'B',min:2,max:null,p:[36,42,54],cic:'A',nt:"Apparato radicale profondo e buona resistenza alla siccita: e l'alternativa sensata al mais quando l'irrigazione non c'e.",av:['Sensibile ai danni da fauna selvatica, rilevanti in alcune aree del Delta.']},
{s:'colza',n:'Colza',sci:'Brassica napus',i:'RAPE',c:'oleaginose e proteiche',t:'LMA',o:'LM',irr:'N',alt:'PC',pv:'*-BL',ph:[5.5,6,7.5,8],sal:'M',cal:'M',dre:'B',min:2,max:null,p:[38,45,56],cic:'A',nt:'Ciclo autunno-vernino con raccolta a inizio estate. Ottima coltura di rottura nelle rotazioni cerealicole e utile per la copertura invernale del suolo.',av:['Semina delicata: richiede letto di semina fine e umidita alla semina.']},
{s:'pisello-proteico',n:'Pisello proteico',sci:'Pisum sativum',i:'PEAPROT',c:'oleaginose e proteiche',t:'LMA',o:'LM',irr:'N',alt:'PC',pv:'*-BL',ph:[5.8,6.2,7.5,8],sal:'B',cal:'M',dre:'B',min:1,max:null,p:[26,32,42],cic:'A',nt:'Leguminosa da granella per uso zootecnico. Azotofissatrice, libera il campo presto e migliora la struttura del suolo.',av:['Non tollera il ristagno idrico: da evitare sulle argille mal drenate.']},
{s:'fagiolo-secco',n:'Fagiolo da granella',sci:'Phaseolus vulgaris',i:'BEANK',c:'oleaginose e proteiche',t:'LMS',o:'LM',irr:'C',alt:'PC',pv:'*',ph:[6,6.3,7.2,7.8],sal:'B',cal:'M',dre:'B',min:0.5,max:80,p:[110,160,230],cic:'A',nt:'In Veneto esistono ecotipi locali riconosciuti (Lamon, Posina) che spuntano prezzi molto superiori alla commodity: il valore sta nella denominazione, non nella resa.',av:['Molto sensibile alla salinita: da escludere nelle aree del Delta con risalita salina.','Prezzo indicato per prodotto di qualita locale; il fagiolo generico vale una frazione.']},
{s:'cece',n:'Cece',sci:'Cicer arietinum',i:'CHICS',c:'oleaginose e proteiche',t:'MLS',o:'MS',irr:'N',alt:'PC',pv:'*-BL',ph:[6,6.5,8,8.5],sal:'M',cal:'B',dre:'B',min:0.5,max:60,p:[90,130,180],cic:'A',nt:'Leguminosa rustica e resistente alla siccita, adatta ai terreni sciolti e calcarei. Superfici venete ancora minime, mercato in crescita.',av:['Molto sensibile al ristagno e alle piogge in raccolta.']},
{s:'fava',n:'Fava da granella',sci:'Vicia faba',i:'BROAFIELD',c:'oleaginose e proteiche',t:'ALM',o:'AL',irr:'N',alt:'PC',pv:'*-BL',ph:[6,6.5,7.8,8.3],sal:'M',cal:'B',dre:'M',min:0.5,max:null,p:[28,36,48],cic:'A',nt:'La leguminosa da granella piu adatta ai terreni argillosi e pesanti, dove il pisello soffre. Forte azotofissazione.',av:[]},
{s:'lenticchia',n:'Lenticchia',sci:'Lens culinaris',i:'LENTIL',c:'oleaginose e proteiche',t:'MSL',o:'MS',irr:'N',alt:'PCM',pv:'*',ph:[6,6.5,8,8.5],sal:'B',cal:'B',dre:'B',min:0.3,max:30,p:[180,260,380],cic:'A',nt:'Resa molto bassa ma prezzo elevatissimo: funziona solo su filiere locali e vendita diretta, non come commodity.',av:['Resa bassa e instabile, raccolta difficile.','Superficie regionale di pochi ettari: il dato ISTAT ha valore puramente indicativo.']},
// -------------------------------------------------------- colture industriali
{s:'barbabietola-da-zucchero',n:'Barbabietola da zucchero',sci:'Beta vulgaris',i:'BEETS',c:'colture industriali',t:'ALM',o:'LA',irr:'C',alt:'P',pv:'RO,PD,VE,VR',ph:[6,6.5,7.5,8.5],sal:'A',cal:'B',dre:'M',min:3,max:null,p:[4.2,4.8,5.6],cic:'A',nt:'Coltura storica del Polesine e della bassa veronese. Ottima tolleranza alla salinita, il che la rende una delle poche opzioni valide sui terreni salsi di bonifica.',av:['Richiede contratto di conferimento con lo zuccherificio: la superficie non e liberamente coltivabile.','Il prezzo effettivo dipende dal grado polarimetrico e dagli accordi interprofessionali.']},
{s:'tabacco',n:'Tabacco',sci:'Nicotiana tabacum',i:'TOBAC',c:'colture industriali',t:'SLM',o:'SM',irr:'R',alt:'PC',pv:'VR,VI,PD,TV',ph:[5.5,5.8,6.8,7.5],sal:'B',cal:'A',dre:'B',min:1,max:null,p:[220,280,340],cic:'A',nt:'PLV per ettaro tra le piu alte dei seminativi, ma vincolata a contratto di filiera e con costi di manodopera, cura e trasformazione altissimi.',av:['Coltura da contratto: senza accordo con la manifattura non ha sbocco.','Preferisce suoli acidi e sciolti: sui calcarei da clorosi.']},
{s:'canapa',n:'Canapa da fibra e seme',sci:'Cannabis sativa',i:'HEMP',c:'colture industriali',t:'LMA',o:'LM',irr:'N',alt:'PC',pv:'*-BL',ph:[6,6.5,7.5,8],sal:'M',cal:'M',dre:'B',min:1,max:120,p:[55,80,120],cic:'A',nt:'Rustica e a bassi input, ottima coltura da rottura. Il valore dipende interamente dalla destinazione: fibra, seme o infiorescenza sono tre mercati diversi.',av:['Soggetta a obblighi normativi: varieta certificate iscritte al catalogo UE e comunicazione alle autorita.','Senza un contratto di trasformazione a monte la raccolta e difficilmente collocabile.']},
{s:'luppolo',n:'Luppolo',sci:'Humulus lupulus',i:'HOPS',c:'colture industriali',t:'LMS',o:'LM',irr:'R',alt:'PC',pv:'*',ph:[6,6.2,7.2,7.8],sal:'B',cal:'M',dre:'B',min:0.3,max:20,p:[700,1000,1400],cic:'P',nt:'Poliennale con impianto costoso (pali e tiranti) e piena produzione al terzo anno. Domanda trainata dai birrifici artigianali, filiera italiana ancora piccola.',av:["Investimento d'impianto molto elevato: alcune migliaia di euro per ettaro prima del primo raccolto.",'Raccolta ed essiccazione richiedono attrezzature specifiche o un centro di servizio.']},
{s:'lino',n:'Lino',sci:'Linum usitatissimum',i:'FLAX',c:'colture industriali',t:'LMS',o:'LM',irr:'N',alt:'PC',pv:'*-BL',ph:[5.5,6,7,7.5],sal:'B',cal:'M',dre:'B',min:1,max:80,p:[45,60,85],cic:'A',nt:'Ciclo breve e pochi input. In Veneto le superfici sono minime e legate a filiere specifiche per olio o fibra.',av:['Mercato molto ristretto: verificare lo sbocco prima della semina.']},
// ------------------------------------------------------------- foraggere
{s:'erba-medica',n:'Erba medica',sci:'Medicago sativa',i:'LUCERNE',c:'foraggere',t:'ALM',o:'LM',irr:'C',alt:'PC',pv:'*',ph:[6.2,6.6,7.8,8.3],sal:'M',cal:'B',dre:'B',min:1,max:null,p:[13,16,21],cic:'P',nt:"Poliennale: l'investimento si ammortizza su 4-5 anni con 4-5 tagli l'anno. Azotofissatrice, migliora struttura e fertilita del suolo.",av:['Non tollera i terreni asfittici o con falda alta.','Molto sensibile ai suoli acidi: sotto pH 6,2 il prato dura poco.']},
{s:'prato-polifita',n:'Prato polifita avvicendato',sci:'consociazione graminacee e leguminose',i:'MIXEPORARY',c:'foraggere',t:'ALMS',o:'ML',irr:'N',alt:'PCM',pv:'*',ph:[5.5,6,7.5,8],sal:'M',cal:'B',dre:'M',min:0.5,max:null,p:[11,14,18],cic:'P',nt:'Costi e rischio bassi, nessun fabbisogno irriguo obbligatorio. In area montana e spesso la sola opzione tecnicamente sensata.',av:['PLV bassa in assoluto: va valutata insieme ai pagamenti PAC e agro-ambientali, che qui pesano proporzionalmente molto piu che sui seminativi.']},
{s:'prato-permanente',n:'Prato permanente',sci:'cotico erboso stabile',i:'PERMGRASSE',c:'foraggere',t:'ALMS',o:'ML',irr:'N',alt:'CM',pv:'*',ph:[5,5.5,7.5,8],sal:'M',cal:'B',dre:'T',min:0.5,max:null,p:[11,14,18],cic:'P',nt:'Cotico stabile non avvicendato, tipico della montagna veneta. Nessun costo di reimpianto e accesso a diversi impegni agro-ambientali.',av:['La conversione a seminativo di un prato permanente e soggetta a vincoli di condizionalita.']},
{s:'mais-ceroso',n:'Mais ceroso da insilato',sci:'Zea mays',i:'CEROIS',c:'foraggere',t:'ALMS',o:'LM',irr:'C',alt:'P',pv:'*-BL',ph:[5.5,6,7.5,8.2],sal:'M',cal:'M',dre:'B',min:2,max:null,p:[4.5,5.8,7.5],cic:'A',nt:"Raccolto a maturazione cerosa e insilato: destinato a zootecnia e biogas. Resa in biomassa molto alta, ma il prodotto vale poco al quintale ed e difficilmente trasportabile lontano.",av:['Il mercato e locale per definizione: senza una stalla o un impianto biogas vicino non ha sbocco.']},
// ------------------------------------------------------------- orticole
{s:'patata',n:'Patata',sci:'Solanum tuberosum',i:'POTA',c:'orticole',t:'SLM',o:'SM',irr:'C',alt:'PCM',pv:'*',ph:[4.8,5.2,6.5,7.5],sal:'B',cal:'M',dre:'B',min:0.5,max:60,p:[19,26,36],cic:'A',nt:'Non ama i terreni pesanti: sulle argille la qualita del tubero e la raccolta peggiorano molto. Preferisce suoli tendenzialmente acidi, dove la scabbia e meno aggressiva.',av:['PLV alta ma costi elevati: seme, meccanizzazione specifica e conservazione.','Prezzo molto volatile da un\'annata all\'altra.']},
{s:'pomodoro-da-industria',n:'Pomodoro da industria',sci:'Solanum lycopersicum',i:'OFTP',c:'orticole',t:'LMA',o:'LM',irr:'R',alt:'P',pv:'VR,PD,RO,VE',ph:[5.8,6.2,7.2,8],sal:'M',cal:'M',dre:'B',min:2,max:null,p:[10,12,14.5],cic:'A',nt:'Coltura da contratto: il prezzo si definisce con accordi di filiera prima della semina, quindi il rischio prezzo e piu contenuto di quello di una commodity libera.',av:["Serve contratto con l'industria di trasformazione.","Irrigazione indispensabile e ben programmata: senza, la coltura non sta in piedi."]},
{s:'pomodoro-da-mensa',n:'Pomodoro da mensa',sci:'Solanum lycopersicum',i:'OFTTOT',c:'orticole',t:'LMS',o:'LM',irr:'R',alt:'P',pv:'*-BL',ph:[5.8,6.2,7,7.8],sal:'M',cal:'M',dre:'B',min:0.2,max:20,p:[45,70,110],cic:'A',nt:'Destinazione fresco: prezzo molto piu alto del pomodoro da industria ma manodopera per raccolta scalare incomparabilmente superiore.',av:['Raccolta manuale ripetuta: il fattore limitante e la manodopera, non la terra.']},
{s:'radicchio',n:'Radicchio',sci:'Cichorium intybus',i:'CHICNOPEN',c:'orticole',t:'LMSA',o:'LM',irr:'C',alt:'P',pv:'TV,VE,PD,RO,VR',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'B',min:0.3,max:40,p:[38,55,75],cic:'A',nt:"Il prodotto identitario dell'orticoltura veneta, con piu tipologie a IGP. Ottima coltura da secondo raccolto dopo un cereale.",av:['Manodopera molto elevata, spesso il vero fattore limitante piu della terra.','Range di PLV largo: dipende in modo determinante dalla tipologia e dal canale di vendita.']},
{s:'zucchina',n:'Zucchina',sci:'Cucurbita pepo',i:'COURINOPE',c:'orticole',t:'SLM',o:'LM',irr:'R',alt:'P',pv:'*-BL',ph:[5.8,6.2,7.2,7.8],sal:'M',cal:'M',dre:'B',min:0.2,max:25,p:[40,60,90],cic:'A',nt:'Ciclo rapido e possibilita di piu cicli per stagione. Raccolta scalare quasi quotidiana in piena produzione.',av:['Richiede presenza costante per la raccolta: non compatibile con una gestione part-time.']},
{s:'zucca',n:'Zucca',sci:'Cucurbita maxima',i:'ZUCCA',c:'orticole',t:'SLM',o:'SL',irr:'C',alt:'P',pv:'RO,VE,PD,VR',ph:[5.8,6.2,7.2,7.8],sal:'M',cal:'M',dre:'B',min:0.5,max:30,p:[18,26,34],cic:'A',nt:'Si adatta bene ai terreni sciolti del Delta e della fascia litoranea. Buona conservabilita, quindi possibilita di scaglionare la vendita e non subire il picco di offerta.',av:['Raccolta manuale onerosa.']},
{s:'pisello-da-mensa',n:'Pisello da mensa',sci:'Pisum sativum',i:'PEAENFIEL',c:'orticole',t:'LMA',o:'LM',irr:'C',alt:'PC',pv:'*-BL',ph:[6,6.3,7.3,7.8],sal:'B',cal:'M',dre:'B',min:1,max:null,p:[35,48,65],cic:'A',nt:'Raccolta meccanica e ciclo breve: libera il campo a inizio estate per una seconda coltura. Spesso su contratto con industria di surgelazione.',av:['Non tollera il ristagno idrico.']},
{s:'asparago',n:'Asparago',sci:'Asparagus officinalis',i:'ASPAINGREOPEN',c:'orticole',t:'SLM',o:'SM',irr:'C',alt:'PC',pv:'*-BL',ph:[6,6.5,7.8,8.3],sal:'A',cal:'M',dre:'B',min:0.3,max:25,p:[220,320,450],cic:'P',nt:"Poliennale con 8-12 anni di produzione. In Veneto esistono piu IGP (Bassano, Badoere, Cimadolmo). Ottima tolleranza alla salinita: e una delle poche orticole di pregio proponibili vicino alla costa.",av:["Investimento d'impianto rilevante e prima raccolta piena al terzo anno.",'Raccolta manuale quotidiana per 6-8 settimane: fabbisogno di manodopera concentratissimo.']},
{s:'fagiolino',n:'Fagiolino',sci:'Phaseolus vulgaris',i:'FRESNEYBEA',c:'orticole',t:'LMS',o:'LM',irr:'R',alt:'PC',pv:'*-BL',ph:[6,6.3,7.2,7.8],sal:'B',cal:'M',dre:'B',min:0.5,max:40,p:[75,110,160],cic:'A',nt:'Ciclo breve, spesso su contratto per surgelazione con raccolta meccanica. Azotofissatrice.',av:['Molto sensibile alla salinita e al ristagno.']},
{s:'cavolo-bianco',n:'Cavolo cappuccio',sci:'Brassica oleracea var. capitata',i:'HTABG',c:'orticole',t:'LMA',o:'LM',irr:'C',alt:'PC',pv:'*',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'M',min:0.3,max:40,p:[16,24,36],cic:'A',nt:'Rustico e produttivo, buona conservabilita. Sostiene bene i terreni piu pesanti rispetto ad altre orticole.',av:['Attenzione alla successione con altre brassicacee: rischio di ernia del cavolo.']},
{s:'cipolla',n:'Cipolla',sci:'Allium cepa',i:'ONIOOPENF',c:'orticole',t:'LMS',o:'LM',irr:'C',alt:'P',pv:'*-BL',ph:[6,6.3,7.5,8],sal:'B',cal:'M',dre:'B',min:0.3,max:40,p:[20,30,45],cic:'A',nt:'Buona conservabilita e possibilita di vendita scaglionata. Richiede terreni sciolti e ben drenati, mal sopporta le argille compatte.',av:['Sensibile alla salinita.','Raccolta e cura del prodotto richiedono manodopera o servizio esterno.']},
{s:'carota',n:'Carota',sci:'Daucus carota',i:'CARRNDPARS',c:'orticole',t:'SLM',o:'SM',irr:'C',alt:'P',pv:'*-BL',ph:[5.8,6.2,7.2,7.8],sal:'M',cal:'M',dre:'B',min:0.5,max:40,p:[22,32,48],cic:'A',nt:'Vuole terreni sciolti, profondi e privi di scheletro: sui terreni pesanti la radice si deforma e il prodotto diventa non commerciabile.',av:['Da escludere sui terreni argillosi compatti anche se formalmente compatibili.']},
{s:'aglio',n:'Aglio',sci:'Allium sativum',i:'GARLIC',c:'orticole',t:'LMS',o:'L',irr:'C',alt:'P',pv:'RO,PD,VE',ph:[6,6.3,7.5,8],sal:'B',cal:'M',dre:'B',min:0.2,max:15,p:[160,250,340],cic:'A',nt:"In Polesine esiste la DOP Aglio Bianco Polesano, che sposta il prezzo su un piano completamente diverso dalla commodity: e il caso piu chiaro di come la qualificazione di filiera valga piu della resa.",av:['Costi molto alti: manodopera per selezione e confezionamento, seme costoso.',"L'accesso alla DOP richiede iscrizione al sistema di controllo: senza, il prezzo e molto inferiore."]},
{s:'melone',n:'Melone',sci:'Cucumis melo',i:'MELOOPENFI',c:'orticole',t:'SLM',o:'SL',irr:'R',alt:'P',pv:'*-BL',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'B',min:0.3,max:25,p:[35,50,75],cic:'A',nt:'Vuole terreni sciolti, caldi e ben drenati. Discreta tolleranza alla salinita, che ne fa una coltura possibile nelle sabbie litoranee.',av:['Raccolta scalare manuale e prodotto molto deperibile: serve un canale commerciale pronto.']},
{s:'cocomero',n:'Cocomero',sci:'Citrullus lanatus',i:'WATENINOP',c:'orticole',t:'SLM',o:'S',irr:'R',alt:'P',pv:'RO,VE,PD,VR',ph:[5.8,6,7.2,7.8],sal:'M',cal:'M',dre:'B',min:0.5,max:30,p:[12,18,28],cic:'A',nt:'Coltura tipica delle sabbie del Delta e della fascia litoranea, dove il terreno caldo e drenante favorisce precocita e grado zuccherino.',av:['Prodotto ingombrante e deperibile: la logistica incide molto sul risultato economico.']},
{s:'porro',n:'Porro',sci:'Allium porrum',i:'LEEKOPENFI',c:'orticole',t:'LMS',o:'LM',irr:'C',alt:'PC',pv:'*',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'B',min:0.2,max:20,p:[35,50,75],cic:'A',nt:'Ciclo lungo, raccolta scalare autunno-invernale. Buona integrazione con le orticole estive nella stessa superficie.',av:['Rincalzatura e raccolta molto onerose in manodopera.']},
{s:'cavolfiore',n:'Cavolfiore e cavolo broccolo',sci:'Brassica oleracea var. botrytis',i:'CAULERAND',c:'orticole',t:'LMA',o:'LM',irr:'C',alt:'PC',pv:'*',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'M',min:0.3,max:30,p:[30,45,70],cic:'A',nt:'Buona coltura autunno-invernale, si inserisce dopo un cereale. Prezzo molto sensibile alle ondate di offerta contemporanea.',av:['Finestra di raccolta stretta: un caldo anomalo puo far accavallare tutta la produzione.']},
{s:'cavolo-verza',n:'Cavolo verza',sci:'Brassica oleracea var. sabauda',i:'SAVOBAGEIN',c:'orticole',t:'LMA',o:'LM',irr:'C',alt:'PC',pv:'*',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'M',min:0.3,max:30,p:[22,32,48],cic:'A',nt:'Molto resistente al freddo: si raccoglie fino a inverno inoltrato, quando l offerta di ortaggi freschi locali e scarsa.',av:[]},
{s:'lattuga',n:'Lattuga',sci:'Lactuca sativa',i:'LETTNOPEN',c:'orticole',t:'LMS',o:'LM',irr:'R',alt:'PC',pv:'*',ph:[6,6.2,7,7.5],sal:'B',cal:'M',dre:'B',min:0.2,max:20,p:[40,60,90],cic:'A',nt:'Ciclo brevissimo (50-70 giorni) e possibilita di 2-3 cicli per stagione sulla stessa superficie: la PLV annua per ettaro puo essere molto superiore a quella del singolo ciclo.',av:['Molto sensibile alla salinita.','Prodotto deperibile: senza canale commerciale immediato non si colloca.']},
{s:'spinacio',n:'Spinacio',sci:'Spinacia oleracea',i:'SPINNOPEN',c:'orticole',t:'LMS',o:'LM',irr:'C',alt:'PC',pv:'*',ph:[6.2,6.5,7.5,8],sal:'M',cal:'M',dre:'B',min:0.3,max:40,p:[35,50,75],cic:'A',nt:'Ciclo breve autunnale o primaverile, spesso su contratto per surgelazione con raccolta meccanica: e una delle poche orticole con manodopera contenuta.',av:['Molto sensibile ai suoli acidi.']},
{s:'melanzana',n:'Melanzana',sci:'Solanum melongena',i:'EGGINOPE',c:'orticole',t:'LMS',o:'LM',irr:'R',alt:'P',pv:'*-BL',ph:[5.8,6,7,7.5],sal:'B',cal:'M',dre:'B',min:0.2,max:15,p:[45,70,110],cic:'A',nt:'Coltura esigente in caldo e acqua, con raccolta scalare prolungata da luglio a ottobre.',av:['Manodopera elevata e continua.','Sensibile alla salinita e alle stanchezze del terreno: richiede rotazioni ampie.']},
{s:'peperone',n:'Peperone',sci:'Capsicum annuum',i:'REDRINOP',c:'orticole',t:'LMS',o:'LM',irr:'R',alt:'P',pv:'*-BL',ph:[5.8,6.2,7,7.5],sal:'B',cal:'M',dre:'B',min:0.2,max:12,p:[55,85,130],cic:'A',nt:'PLV per ettaro elevata ma coltura tra le piu esigenti in tecnica, acqua e manodopera. Spesso conviene solo con vendita diretta o canale specializzato.',av:['Molto sensibile alla salinita e al ristagno.','Richiede difesa fitosanitaria attenta.']},
{s:'finocchio',n:'Finocchio',sci:'Foeniculum vulgare',i:'FENNOPENF',c:'orticole',t:'LMS',o:'LM',irr:'C',alt:'P',pv:'*-BL',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'B',min:0.3,max:25,p:[35,50,75],cic:'A',nt:'Buona coltura autunno-invernale nelle aree a inverno mite, come la fascia litoranea. Superfici venete ancora limitate.',av:['Sensibile alle gelate forti: rischioso nelle aree interne.']},
{s:'sedano',n:'Sedano',sci:'Apium graveolens',i:'CELEOPENF',c:'orticole',t:'LMA',o:'LM',irr:'R',alt:'P',pv:'*-BL',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'B',min:0.2,max:15,p:[40,60,90],cek:'A',cic:'A',nt:'Ciclo lungo e forte fabbisogno idrico e di sostanza organica. Tollera terreni piu pesanti di altre orticole.',av:['Manodopera elevata per trapianto e raccolta.']},
{s:'indivia',n:'Indivia riccia e scarola',sci:'Cichorium endivia',i:'ENDINOPEN',c:'orticole',t:'LMS',o:'LM',irr:'C',alt:'P',pv:'*-BL',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'B',min:0.2,max:20,p:[35,50,75],cic:'A',nt:'Affine al radicchio per tecnica colturale e calendario: si inserisce nelle stesse rotazioni orticole autunnali.',av:['Prodotto deperibile con prezzo molto variabile.']},
{s:'bietola-da-costa',n:'Bietola da costa',sci:'Beta vulgaris var. cicla',i:'CHAROPENFI',c:'orticole',t:'LMA',o:'LM',irr:'C',alt:'P',pv:'*-BL',ph:[6.2,6.5,7.8,8.3],sal:'A',cal:'M',dre:'M',min:0.2,max:20,p:[30,45,68],cic:'A',nt:'Raccolta scalare a piu tagli sulla stessa semina. Buona tolleranza alla salinita, come tutte le Beta.',av:['Prodotto molto deperibile: adatto a filiere corte.']},
{s:'carciofo',n:'Carciofo',sci:'Cynara cardunculus',i:'GLOBICHOKE',c:'orticole',t:'LMS',o:'LM',irr:'C',alt:'P',pv:'VE,RO,PD',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'B',min:0.3,max:15,p:[70,110,170],cic:'P',nt:'Poliennale con 3-4 anni di produzione. Nel Veneziano esistono produzioni storiche di pregio legate alle isole lagunari.',av:["Investimento d'impianto e attesa del primo raccolto pieno.",'Sensibile alle gelate: nelle aree interne serve protezione.']},
{s:'scalogno',n:'Scalogno',sci:'Allium ascalonicum',i:'SHALLOT',c:'orticole',t:'LMS',o:'LM',irr:'C',alt:'P',pv:'*-BL',ph:[6,6.3,7.5,8],sal:'B',cal:'M',dre:'B',min:0.2,max:10,p:[90,140,200],cic:'A',nt:'Affine alla cipolla ma con prezzo unitario molto superiore e mercato piu ristretto. Superfici venete minime.',av:['Mercato di nicchia: la domanda si satura in fretta.']},
{s:'cetriolo',n:'Cetriolo da mensa',sci:'Cucumis sativus',i:'CUCUINOPE',c:'orticole',t:'LMS',o:'LM',irr:'R',alt:'P',pv:'*-BL',ph:[5.8,6.2,7.2,7.8],sal:'B',cal:'M',dre:'B',min:0.2,max:12,p:[35,55,85],cic:'A',nt:'Ciclo rapido con raccolta scalare molto frequente. Resa per ettaro elevatissima ma prodotto deperibile.',av:['Raccolta quasi quotidiana in piena produzione.','Sensibile alla salinita.']},
{s:'batata',n:'Batata (patata dolce)',sci:'Ipomoea batatas',i:'SWEEATOES',c:'orticole',t:'SLM',o:'SM',irr:'C',alt:'P',pv:'*-BL',ph:[5.2,5.8,6.8,7.5],sal:'M',cal:'M',dre:'B',min:0.3,max:20,p:[55,80,120],cic:'A',nt:'Coltura in espansione, adatta ai terreni sciolti e caldi. Domanda in crescita e prezzo nettamente superiore alla patata comune.',av:['Ciclo lungo che richiede estate calda: raccolta tardiva a rischio nelle annate fresche.','Conservazione delicata: richiede curing e magazzino temperato.']},
{s:'broccoletto-di-rapa',n:'Broccoletto di rapa',sci:'Brassica rapa',i:'BROCINOPEN',c:'orticole',t:'LMS',o:'LM',irr:'C',alt:'PC',pv:'*',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'M',min:0.2,max:20,p:[45,65,95],cic:'A',nt:'Ciclo breve autunno-invernale, ottimo come coltura di completamento dopo un cereale o una orticola estiva.',av:['Raccolta manuale scalare.']},
{s:'ravanello',n:'Ravanello',sci:'Raphanus sativus',i:'RADIOPEN',c:'orticole',t:'SLM',o:'SL',irr:'C',alt:'P',pv:'*-BL',ph:[5.8,6.2,7.2,7.8],sal:'M',cal:'M',dre:'B',min:0.1,max:8,p:[45,70,110],cic:'A',nt:'Ciclo brevissimo, anche 25-35 giorni: consente molti cicli l anno su piccole superfici. Tipico delle aziende orticole con vendita diretta.',av:['Mercato limitato in volume: si satura con poche superfici.']},
{s:'barbabietola-da-orto',n:'Barbabietola da orto',sci:'Beta vulgaris',i:'BEETANDLEA',c:'orticole',t:'LMS',o:'LM',irr:'C',alt:'P',pv:'*-BL',ph:[6.2,6.5,7.8,8.3],sal:'A',cal:'M',dre:'M',min:0.2,max:20,p:[28,42,62],cic:'A',nt:'Rustica e tollerante alla salinita. Domanda in crescita per il canale della quarta gamma e dei precotti.',av:[]},
// --------------------------------------------------------------- frutta
{s:'vite-da-vino',n:'Vite da vino',sci:'Vitis vinifera',i:'WINEES',c:'frutta',t:'MLSA',o:'MS',irr:'N',alt:'PC',pv:'*',ph:[5.5,6,7.5,8.5],sal:'M',cal:'B',dre:'B',min:0.5,max:null,p:[35,60,110],cic:'P',nt:'Il comparto di maggior valore del Veneto. La PLV dipende quasi interamente dalla denominazione: la stessa resa in DOC di pregio o in vino comune produce ricavi molto diversi.',av:["Coltura poliennale con investimento d'impianto rilevante e 3-4 anni prima della piena produzione: la PLV annua non e confrontabile direttamente con quella di un seminativo.",'Nuovi impianti soggetti ad autorizzazione: la superficie non e liberamente ampliabile.']},
{s:'mela',n:'Melo',sci:'Malus domestica',i:'APPLE',c:'frutta',t:'LMS',o:'LM',irr:'C',alt:'PCM',pv:'*',ph:[5.5,6,7,7.8],sal:'B',cal:'A',dre:'B',min:0.5,max:null,p:[28,40,60],cic:'P',nt:'Resa per ettaro tra le piu alte in assoluto. In Veneto la melicoltura e concentrata nel Veronese e in area pedemontana, dove le escursioni termiche danno colore e serbevolezza.',av:["Investimento d'impianto molto elevato (portinnesti, pali, rete antigrandine, impianto irriguo) e piena produzione al quarto-quinto anno.",'Sensibile alla clorosi ferrica sui terreni calcarei.','La rete antigrandine e di fatto obbligatoria per la sostenibilita economica.']},
{s:'pera',n:'Pero',sci:'Pyrus communis',i:'PEAR',c:'frutta',t:'LMA',o:'LM',irr:'C',alt:'PC',pv:'*-BL',ph:[6,6.3,7.2,7.8],sal:'B',cal:'A',dre:'B',min:0.5,max:null,p:[35,50,80],cic:'P',nt:'Tollera terreni piu pesanti del melo. Superfici in calo per le difficolta fitosanitarie (cimice asiatica, maculatura bruna) e la concorrenza emiliana.',av:['Molto sensibile alla clorosi ferrica: su terreni calcarei serve portinnesto adatto.','Pressione fitosanitaria elevata: la difesa incide molto sui costi.']},
{s:'pesca',n:'Pesco',sci:'Prunus persica',i:'PEACH',c:'frutta',t:'SLM',o:'SM',irr:'C',alt:'PC',pv:'VR,VI,PD,TV,VE',ph:[6,6.5,7.2,7.8],sal:'B',cal:'A',dre:'B',min:0.5,max:null,p:[40,60,95],cic:'P',nt:'Vuole terreni sciolti, profondi e ben drenati. Il Veronese e uno dei distretti storici italiani della peschicoltura.',av:['Molto sensibile alla clorosi ferrica e alla asfissia radicale: da escludere su argille mal drenate.','Stanchezza del terreno nei reimpianti: serve rotazione o disinfestazione.']},
{s:'nettarina',n:'Nettarina',sci:'Prunus persica var. nucipersica',i:'NECTA',c:'frutta',t:'SLM',o:'SM',irr:'C',alt:'PC',pv:'VR,VI,PD,TV,VE',ph:[6,6.5,7.2,7.8],sal:'B',cal:'A',dre:'B',min:0.5,max:null,p:[42,65,100],cic:'P',nt:'Stessa tecnica colturale del pesco, con quotazioni mediamente superiori e una domanda piu stabile sul mercato del fresco.',av:['Stesse sensibilita del pesco: clorosi ferrica e asfissia radicale.']},
{s:'albicocca',n:'Albicocco',sci:'Prunus armeniaca',i:'APRIC',c:'frutta',t:'SLM',o:'SM',irr:'C',alt:'PC',pv:'VR,VI,PD,VE',ph:[6.2,6.5,7.8,8.3],sal:'M',cal:'M',dre:'B',min:0.3,max:null,p:[55,85,130],cic:'P',nt:'Tollera il calcare meglio di pesco e melo. Fioritura molto precoce, quindi esposta alle gelate tardive: la scelta del sito conta piu della scelta varietale.',av:['Rischio gelate tardive elevato nelle aree di fondovalle e nelle bassure.']},
{s:'susina',n:'Susino',sci:'Prunus domestica',i:'PLUM',c:'frutta',t:'LMA',o:'LM',irr:'C',alt:'PC',pv:'*-BL',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'M',min:0.3,max:null,p:[35,55,85],cic:'P',nt:'Tra le drupacee e la piu adattabile ai terreni pesanti e la meno esigente in tecnica. Buona alternativa dove pesco e albicocco soffrono.',av:['Alternanza di produzione: il diradamento e determinante per la costanza delle rese.']},
{s:'ciliegia',n:'Ciliegio',sci:'Prunus avium',i:'SWCHERRIES',c:'frutta',t:'SLM',o:'SM',irr:'C',alt:'PCM',pv:'*',ph:[6,6.5,7.5,8],sal:'B',cal:'M',dre:'B',min:0.3,max:null,p:[150,240,380],cic:'P',nt:'Prezzo unitario tra i piu alti della frutta veneta, con produzioni di pregio nel Veronese e nel Trevigiano. Resa per ettaro modesta ma valore altissimo.',av:['Fortissimo rischio di cracking da pioggia in maturazione: senza copertura antipioggia il rischio economico e alto.','Raccolta manuale interamente a mano, con fabbisogno di manodopera concentrato.']},
{s:'amarena',n:'Amareno',sci:'Prunus cerasus',i:'ORCERE',c:'frutta',t:'LMA',o:'LM',irr:'N',alt:'PC',pv:'*-BL',ph:[6,6.3,7.5,8],sal:'M',cal:'M',dre:'M',min:0.3,max:null,p:[80,120,180],cic:'P',nt:'Piu rustico del ciliegio dolce e destinato alla trasformazione, quindi con raccolta meccanizzabile e minor fabbisogno di manodopera.',av:['Mercato legato quasi interamente alla trasformazione: serve un contratto.']},
{s:'kiwi',n:'Actinidia (kiwi)',sci:'Actinidia deliciosa',i:'KIWI',c:'frutta',t:'LMS',o:'LM',irr:'R',alt:'P',pv:'VR,TV,PD,VE,VI',ph:[5.5,6,6.8,7.5],sal:'B',cal:'A',dre:'B',min:0.5,max:null,p:[45,70,110],cic:'P',nt:'Elevato fabbisogno idrico costante e struttura di sostegno obbligatoria (pergoletta o tendone).',av:['Molto sensibile al calcare attivo: su terreni calcarei va in clorosi grave.','Estremamente sensibile alla asfissia radicale: il drenaggio e la prima condizione, non un dettaglio.','Moria del kiwi: patologia diffusa che ha compromesso interi impianti in Veneto.']},
{s:'uva-da-tavola',n:'Uva da tavola',sci:'Vitis vinifera',i:'TABLEGRAPES',c:'frutta',t:'MLS',o:'MS',irr:'C',alt:'PC',pv:'VR,PD,VI,TV',ph:[6,6.3,7.5,8.2],sal:'M',cal:'M',dre:'B',min:0.3,max:40,p:[60,95,150],cic:'P',nt:'Tecnica e mercato completamente diversi dalla vite da vino: conta la qualita estetica del grappolo, quindi diradamento e confezionamento pesano moltissimo.',av:['Superfici venete molto ridotte: il mercato di riferimento e il Sud Italia.','Manodopera altissima per diradamento e raccolta.']},
{s:'olivo',n:'Olivo',sci:'Olea europaea',i:'OLIVO',c:'frutta',t:'MSLA',o:'MS',irr:'N',alt:'PC',pv:'VR,VI,TV,PD,VE',ph:[6.5,7,8.2,8.7],sal:'A',cal:'B',dre:'B',min:0.3,max:null,p:[80,120,180],cic:'P',nt:'In Veneto e concentrato sul Garda e nei rilievi collinari, con oli DOP di pregio. Ottima tolleranza a calcare e salinita, e minimi fabbisogni idrici.',av:['Resa per ettaro bassa: la PLV regge solo con olio di qualita venduto in bottiglia, non con olive conferite sfuse.','Alternanza di produzione marcata: le annate di carica si alternano a quelle di scarica.']},
{s:'noce',n:'Noce',sci:'Juglans regia',i:'WALNU',c:'frutta',t:'LMA',o:'LM',irr:'C',alt:'PC',pv:'*',ph:[6,6.5,7.5,8],sal:'B',cal:'M',dre:'B',min:1,max:null,p:[180,260,380],cic:'P',nt:'Poliennale a lungo ciclo con meccanizzazione integrale della raccolta: fabbisogno di manodopera molto basso rispetto alla frutta fresca. Doppio reddito potenziale con il legname.',av:['Piena produzione al settimo-ottavo anno: e un investimento a lungo termine.','Vuole suoli profondi e ben drenati: non tollera il ristagno.']},
{s:'nocciola',n:'Nocciolo',sci:'Corylus avellana',i:'HAZEL',c:'frutta',t:'MLS',o:'ML',irr:'C',alt:'PCM',pv:'*',ph:[5.8,6.2,7.5,8],sal:'B',cal:'M',dre:'B',min:1,max:null,p:[200,300,450],cic:'P',nt:'Raccolta meccanizzata da terra e domanda industriale stabile. Adatto anche alle aree collinari marginali dove altre arboree non reggono.',av:['Piena produzione al quinto-sesto anno.','Cimice asiatica: danno da cimiciato che puo compromettere il valore commerciale del raccolto.']},
{s:'castagno',n:'Castagno',sci:'Castanea sativa',i:'CHEST',c:'frutta',t:'SML',o:'SM',irr:'N',alt:'CM',pv:'BL,VI,VR,TV',ph:[4.5,5,6.5,7],sal:'B',cal:'A',dre:'B',min:1,max:null,p:[180,280,420],cic:'P',nt:"Acidofilo stretto: e una delle poche colture che richiede terreni acidi, quindi vive dove quasi nient'altro di redditizio cresce. Spesso su castagneti da frutto recuperati.",av:['Da escludere su terreni calcarei o alcalini: sopra pH 7 non vegeta.','Cinipide e mal dell inchiostro: la gestione fitosanitaria e determinante.']},
{s:'melograno',n:'Melograno',sci:'Punica granatum',i:'POMETES',c:'frutta',t:'MSL',o:'MS',irr:'C',alt:'P',pv:'*-BL',ph:[5.5,6,7.8,8.5],sal:'A',cal:'M',dre:'B',min:0.3,max:30,p:[80,120,180],cic:'P',nt:'Coltura in espansione: rustica, tollerante a salinita e siccita, con domanda trainata dal succo. Entra in produzione presto rispetto ad altre arboree.',av:['Mercato giovane e volatile: le superfici nazionali sono cresciute in fretta.','Sensibile alle gelate invernali forti.']},
{s:'kaki',n:'Kaki (loto)',sci:'Diospyros kaki',i:'LOTU',c:'frutta',t:'LMA',o:'LM',irr:'C',alt:'P',pv:'*-BL',ph:[5.5,6,7.5,8],sal:'M',cal:'M',dre:'M',min:0.3,max:25,p:[50,75,115],cic:'P',nt:'Rustico e poco esigente in difesa fitosanitaria. Tollera terreni piu pesanti della maggior parte delle arboree da frutto.',av:['Prodotto molto deperibile a maturazione: serve gestione post-raccolta.']},
{s:'fico',n:'Fico',sci:'Ficus carica',i:'FIG',c:'frutta',t:'MSL',o:'MS',irr:'N',alt:'PC',pv:'*-BL',ph:[6,6.5,7.8,8.5],sal:'A',cal:'B',dre:'B',min:0.2,max:15,p:[150,240,360],cic:'P',nt:'Rusticissimo, tollera calcare, salinita e siccita. Prezzo alto sul fresco di qualita ma prodotto estremamente deperibile.',av:['Deperibilita elevatissima: praticabile solo con vendita diretta o trasformazione.','Mercato molto locale.']},
{s:'mirtillo',n:'Mirtillo',sci:'Vaccinium corymbosum',i:'BUBRY',c:'frutta',t:'SML',o:'SM',irr:'R',alt:'PCM',pv:'*',ph:[3.8,4.2,5.2,5.8],sal:'B',cal:'A',dre:'B',min:0.2,max:15,p:[500,750,1100],cic:'P',nt:"Acidofilo obbligato: richiede pH tra 4 e 5,5, condizione rarissima nei suoli veneti di pianura, che sono neutri o alcalini. Fuori da quel range serve coltivazione in substrato acido, che e un'altra impresa.",av:['Il pH e il vincolo assoluto: sopra 5,8 la pianta va in clorosi e muore. Verificare con analisi prima di qualunque investimento.','Irrigazione con acqua a bassa durezza indispensabile.',"Investimento d'impianto molto elevato e manodopera di raccolta altissima."]},
{s:'lampone',n:'Lampone',sci:'Rubus idaeus',i:'ROUSPBERRI',c:'frutta',t:'SML',o:'SM',irr:'R',alt:'CM',pv:'*',ph:[5,5.5,6.5,7],sal:'B',cal:'A',dre:'B',min:0.1,max:10,p:[600,900,1300],cic:'P',nt:'Piccolo frutto da area collinare e montana, dove il clima fresco allunga la stagione di raccolta. Prezzo unitario altissimo, superfici minime.',av:['Manodopera di raccolta enorme: e il fattore che determina la fattibilita.','Deperibilita estrema: serve catena del freddo e canale immediato.']},
{s:'ribes',n:'Ribes',sci:'Ribes rubrum e nigrum',i:'CRAT',c:'frutta',t:'SML',o:'SM',irr:'C',alt:'CM',pv:'BL,VI,VR,TV',ph:[5,5.5,6.8,7.2],sal:'B',cal:'M',dre:'B',min:0.1,max:8,p:[400,600,900],cic:'P',nt:'Piccolo frutto tipico della fascia montana veneta, spesso in filiere corte o legate alla trasformazione (succhi, confetture).',av:['Mercato molto ristretto.','Raccolta manuale onerosa.']},
{s:'fragola',n:'Fragola',sci:'Fragaria x ananassa',i:'STRAIEINO',c:'frutta',t:'SLM',o:'SL',irr:'R',alt:'PCM',pv:'*',ph:[5.5,5.8,6.8,7.2],sal:'B',cal:'A',dre:'B',min:0.1,max:12,p:[250,380,550],cic:'A',nt:'Formalmente non e una arborea ma una erbacea poliennale coltivata come annuale. PLV per ettaro tra le piu alte del dataset, con costi e manodopera proporzionati.',av:['Manodopera di raccolta altissima e prolungata.','Molto sensibile alla salinita e alla stanchezza del terreno: richiede rotazioni lunghe o substrato.']},
{s:'mandorlo',n:'Mandorlo',sci:'Prunus dulcis',i:'ALMO',c:'frutta',t:'MSL',o:'MS',irr:'N',alt:'PC',pv:'VR,VI,PD',ph:[6.5,7,8.2,8.7],sal:'A',cal:'B',dre:'B',min:0.5,max:30,p:[300,450,650],cic:'P',nt:'Rustico e tollerante a calcare e siccita, ma in Veneto e al limite settentrionale del suo areale: la fioritura precocissima lo espone alle gelate.',av:['Rischio di gelata in fioritura molto elevato alle latitudini venete: le superfici regionali sono simboliche e la resa media rilevata e bassissima.','Da considerare sperimentale in questo territorio, nonostante la rilevazione ISTAT.']},
// -------------------------------------------------------- colture di nicchia
{s:'lenticchia-d-acqua',n:"Lenticchia d'acqua",sci:'Lemna minor',i:null,c:'colture di nicchia',t:'ALMS',o:'A',irr:'R',alt:'P',pv:'RO,VE,PD,VR,TV',ph:[6,6.5,7.5,8],sal:'M',cal:'B',dre:'T',min:0.1,max:10,p:[25,40,60],r:[40,100,200],cic:'A',aff:'sperimentale',nt:"Macrofita acquatica a crescita molto rapida, coltivabile su vasche o bacini con ricircolo. Interessante come fonte proteica per l'alimentazione animale e per la fitodepurazione, due filiere che nel Delta del Po hanno senso logistico. La resa indicata e in sostanza secca.",av:['Dato sperimentale: la letteratura disponibile per l\'Italia discute la biomassa in chiave bioenergetica e ammette esplicitamente che la produttivita industriale alle nostre latitudini non e nota.','Non esiste un prezzo di mercato consolidato: il ricavo dipende dal contratto con l\'acquirente, non da una quotazione.','Richiede una struttura dedicata (vasche, ricircolo, raccolta continua): investimento non confrontabile con quello di un seminativo.']},
{s:'luffa',n:'Luffa',sci:'Luffa cylindrica',i:null,c:'colture di nicchia',t:'SLM',o:'SL',irr:'R',alt:'P',pv:'RO,VE,PD,VR',ph:[6,6.3,7.2,7.8],sal:'B',cal:'M',dre:'B',min:0.1,max:5,p:[0.5,0.8,1.2],r:[8000,15000,25000],cic:'A',aff:'sperimentale',ur:'pezzi per ettaro (spugne commercializzabili)',up:'euro per pezzo',nt:'Cucurbitacea da cui si ricava la spugna vegetale. Ciclo estivo lungo, richiede caldo, sostegni e irrigazione. Il valore sta interamente nella trasformazione e nella vendita diretta o via e-commerce, non nel prodotto grezzo.',av:['Dato sperimentale: resa e prezzo sono espressi in pezzi, non in quintali, quindi il confronto con le altre colture del dataset e solo indicativo.','Mercato molto limitato: poche superfici saturano la domanda locale. Non scalabile come un seminativo.','Manodopera elevatissima per raccolta, sbucciatura ed essiccazione.']},
];
/* eslint-enable */

// ------------------------------------------------------------- espansione

const TESSITURE = { A: 'argilloso', S: 'sabbioso', L: 'limoso', M: 'misto' };
const IRRIGAZIONE = { N: 'non_necessaria', C: 'consigliata', R: 'necessaria' };
const ALTIMETRIA = { P: 'pianura', C: 'collina', M: 'montagna' };
const LIVELLO = { B: 'bassa', M: 'media', A: 'alta' };
const DRENAGGIO = { B: 'buono', M: 'medio', T: 'tollera_ristagno' };
const CICLO = { A: 'annuale', P: 'poliennale' };
const TUTTE_PROVINCE = ['RO', 'PD', 'VE', 'TV', 'VI', 'VR', 'BL'];

const espandi = (codice, mappa) => [...codice].map((c) => mappa[c]);

function province(pv) {
  if (pv === '*') return [...TUTTE_PROVINCE];
  if (pv.startsWith('*-')) {
    const escluse = pv.slice(2).split(',');
    return TUTTE_PROVINCE.filter((p) => !escluse.includes(p));
  }
  return pv.split(',');
}

const istat = JSON.parse(readFileSync(join(radice, 'src', 'data', 'istat-veneto.json'), 'utf8'));

// La diffusione pesa quanto una coltura e effettivamente praticata in Veneto.
// Su scala logaritmica, perche le superfici vanno da pochi ettari a 140.000 e
// una scala lineare schiaccerebbe tutto l'ortofrutta a zero.
const SUPERFICIE_RIFERIMENTO = 150000;
const diffusione = (ha) => (ha > 0 ? Math.min(1, Math.log10(ha + 1) / Math.log10(SUPERFICIE_RIFERIMENTO)) : 0);

const colture = [];
const problemi = [];

for (const riga of TABELLA) {
  const datiIstat = riga.i ? istat.colture[riga.i] : null;
  if (riga.i && !datiIstat) {
    problemi.push(`${riga.s}: codice ISTAT ${riga.i} non trovato nell'import`);
    continue;
  }

  const categoria = riga.c;
  const variabilita = riga.v ?? VARIABILITA[categoria] ?? 0.3;

  const resaIstat = datiIstat?.resa_media_q_ha ?? null;
  const resaTipica = resaIstat ?? riga.r?.[1] ?? null;
  if (resaTipica === null) {
    problemi.push(`${riga.s}: nessuna resa, ne ISTAT ne stimata`);
    continue;
  }

  const prezzoTipico = riga.p[1];
  const plvTipica = Math.round(resaTipica * prezzoTipico);

  const affidabilitaResa = riga.aff ?? (datiIstat ? 'istat' : 'stima_esperto');
  // Il prezzo resta una stima finche non importiamo anche DCSP_PREZZIAGR:
  // l'affidabilita complessiva non puo essere migliore del suo anello debole.
  const affidabilitaPrezzo = riga.aff ?? 'stima_esperto';
  const affidabilita = riga.aff ?? (affidabilitaResa === 'istat' ? 'istat_resa' : 'stima_esperto');

  colture.push({
    slug: riga.s,
    nome: riga.n,
    nome_scientifico: riga.sci,
    categoria,
    ciclo: CICLO[riga.cic],
    istat: riga.i,
    terreni: espandi(riga.t, TESSITURE),
    terreni_ottimali: espandi(riga.o, TESSITURE),
    irrigazione: IRRIGAZIONE[riga.irr],
    altimetria: espandi(riga.alt, ALTIMETRIA),
    province: province(riga.pv),
    ph: { minimo: riga.ph[0], ottimale_min: riga.ph[1], ottimale_max: riga.ph[2], massimo: riga.ph[3] },
    tolleranza_salinita: LIVELLO[riga.sal],
    sensibilita_calcare: LIVELLO[riga.cal],
    drenaggio_richiesto: DRENAGGIO[riga.dre],
    superficie_min_ha: riga.min,
    superficie_max_ha: riga.max ?? null,
    superficie_veneto_ha: datiIstat?.superficie_max_ha ?? null,
    diffusione: Math.round(diffusione(datiIstat?.superficie_max_ha ?? 0) * 100) / 100,
    resa_q_ha: {
      scarsa: Math.round(resaTipica * (1 - variabilita) * 10) / 10,
      tipica: resaTipica,
      buona: Math.round(resaTipica * (1 + variabilita) * 10) / 10,
    },
    resa_fonte: datiIstat ? 'istat' : 'stima_esperto',
    resa_anni: datiIstat ? Object.keys(datiIstat.anni) : null,
    prezzo_eur_q: { scarso: riga.p[0], tipico: riga.p[1], buono: riga.p[2] },
    variabilita_plv: variabilita,
    plv_eur_ha: {
      scarsa: Math.round(plvTipica * (1 - variabilita)),
      tipica: plvTipica,
      buona: Math.round(plvTipica * (1 + variabilita)),
    },
    unita_resa_speciale: riga.ur ?? null,
    unita_prezzo_speciale: riga.up ?? null,
    affidabilita,
    affidabilita_resa: affidabilitaResa,
    affidabilita_prezzo: affidabilitaPrezzo,
    fonte: datiIstat
      ? `Resa: ISTAT DCSP_COLTIVAZIONI, Veneto, ${Object.keys(datiIstat.anni).join('-')}. Prezzo: stima di settore.`
      : 'Resa e prezzo: stima di settore, nessuna rilevazione ISTAT per questa coltura.',
    note: riga.nt,
    avvertenze: riga.av ?? [],
  });
}

colture.sort((a, b) => a.categoria.localeCompare(b.categoria, 'it') || b.diffusione - a.diffusione);

const destinazione = join(radice, 'src', 'data', 'colture.json');
writeFileSync(
  destinazione,
  `${JSON.stringify(
    {
      _meta: {
        descrizione:
          'GENERATO da scripts/costruisci-colture.mjs. Non modificare a mano: la sorgente editabile e la TABELLA in quello script.',
        rese: `ISTAT DCSP_COLTIVAZIONI, Veneto, anni ${istat._meta.anni.join('-')}`,
        rese_nota: istat._meta.territorio_nota,
        prezzi: 'Stime di settore, in attesa di import da ISTAT DCSP_PREZZIAGR',
        unita: {
          resa_q_ha: 'quintali per ettaro (1 q = 100 kg)',
          prezzo_eur_q: 'euro per quintale, prezzo alla produzione',
          plv_eur_ha: 'euro per ettaro, Produzione Lorda Vendibile, PAC esclusa',
        },
        affidabilita: {
          istat: 'resa e prezzo da rilevazione ISTAT: calcolo interamente riproducibile',
          istat_resa: 'resa da ISTAT DCSP_COLTIVAZIONI, prezzo ancora da stima di settore',
          stima_esperto:
            'valore di inquadramento da esperienza di settore e letteratura tecnica, non rilevato da ISTAT',
          sperimentale:
            "coltura senza dati agronomico-economici pubblici per l'Italia: valore indicativo, incertezza elevata",
        },
        avvertenza:
          'La PLV non e il reddito: non tiene conto dei costi di produzione. Colture con PLV elevata possono avere marginalita inferiore a colture con PLV modesta. I contributi PAC non sono inclusi.',
        colture: colture.length,
        generato: new Date().toISOString().slice(0, 10),
      },
      colture,
    },
    null,
    2,
  )}\n`,
);

console.log(`${colture.length} colture -> ${destinazione}`);
if (problemi.length) {
  console.log(`\n${problemi.length} problemi:`);
  problemi.forEach((p) => console.log(`  ${p}`));
  process.exitCode = 1;
}

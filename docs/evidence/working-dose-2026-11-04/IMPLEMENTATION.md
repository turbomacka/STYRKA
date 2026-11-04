# Arbetsdos och aktuella passförslag – 2026-11-04

ENGINE/2.3.0 utgår från genomförd jämförbar arbetsdos även när programmets belastningskategori ändras. Ett äldre maxvärdes startprocent får inte skriva över den nivån. Senaste lyckade arbetsdos kan behållas innan den är bekräftad som underlag för ytterligare progression.

Lätt/För lätt i minst två tredjedelar av seten (minst två set, alternativt ett set med tidigare jämförbar prestation) kan stödja ett litet försök redan efter ett fullföljt pass. Vikt eller repetitioner höjs, inte båda. Lagom följer ordinarie bekräftelseregler. Begränsningar, motstridiga signaler och väntetid efter misslyckade försök har företräde.

En aktiv återhämtningsbegränsning för extern vikt använder 95 procent (medel) eller 90 procent (lätt) av arbetsdosen, avrundat nedåt till utrustningssteget. Det är produktheuristiker, inte uppmätt fysiologisk återhämtning. Ordinarie arbetsnivå sparas separat. Ett fullföljt sådant pass utan egna ändringar eller negativa signaler sänker inte den ordinarie basnivån. Maxansträngning, låg uttrycklig RIR, dålig teknik och ofullständigt arbete finns kvar i progressionsbedömningen. Återhämtningsberäkningen använder samtliga faktiska arbetsset.

Ostartade ordinarie passförslag uppdateras vid öppning och före start när motorversion, timme eller underlag ändrats. Samma passidentitet, övningsvariant, utrustning och personliga setändringar bevaras. Påbörjade pass och registrerade prestationer uppdateras inte. Nya oföränderliga rekommendationsnoder länkas till de gamla; synkningen återskapar länkarna utan databasmigration. Framtida andra passmallar ersätter inte ett redan valt pass.

## Riktad verifiering

- Regression för 75 kg × 6: behålls över kategoribyte; lätt återhämtningsdos 67,5 kg × 6 behåller 75 kg som ordinarie nivå. Senare ordinarie pass återgår till nivån.
- Lätt kan ge 75 kg × 7; två jämförbara Lagom-pass kan också ge 75 kg × 7. Ingen numerisk RIR skapas.
- Gammalt förslag på 52,5 kg uppdateras; egen ändring till 77,5 kg × 5 bevaras. Verifierat genom synkning, återöppning och start. Avslutade resultat är oförändrade.
- Planerarjämförelsen omfattar 2 100 syntetiska planer: 245 ändras, samtliga med nylig träningshistorik. 1 855 är identiska. Antalet övningar är oförändrat. Differentialen visar de avsiktliga ändringarna från historisk startprocent till faktisk arbetsdos och tydliga återhämtningsskäl.
- Riktade domän- och applikationstester, typkontroll, lint samt mobilflödet för egen arbetsdos. Full CI körs inför publicering; ingen upprepad full lokal svit.

Kvarvarande avgränsning: timvis uppdatering är en cachepolicy, inte en garanti om omedelbar omberäkning efter varje profiländring. Befintlig kontroll av begränsningar före passstart gäller fortfarande. Fysiska installerade telefoner ingår inte i den automatiska verifieringen.

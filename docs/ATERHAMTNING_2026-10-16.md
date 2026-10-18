# Återhämtning utifrån faktiskt arbete

Status: publicerad 2026-10-16 på https://styrka-staging.homeboard-mh.workers.dev/. Slutlig webbläsarkontroll av den publicerade versionen är godkänd.

Produktbeslut 2026-10-16: förbättra själva beslutsregeln och håll återkopplingen enkel. Ingen ny vy som visar vilken tidigare övning som utlöste anpassningen.

## Beteende

En gemensam deterministisk bedömning används för ordinarie pass, spontanpass och övningsbyten. Den läser arbetssetens faktiska prestationer, tidsstämplar och frivilliga känslosvar/RIR. Planens etikett ”tung” bevisar inte hög faktisk ansträngning. Kilogram eller maskinnivåer jämförs inte mellan utrustningar för att uppskatta trötthet.

Samma rörelsefamilj har större betydelse än delvis överlapp. Knäböj och marklyft är olika mönster med överlapp; bänkpress och militärpress likaså. Varianten frontböj hör däremot till samma mönster som knäböj. Curlvarianter hör ihop, men räknas inte som samma mönster som tricepsövningar. Detta är en uttrycklig förenkling av rörelseöverlapp, inte en komplett muskelmodell.

| Utfört arbete per sida | Planeringsbegränsning |
| --- | --- |
| Ett eller två uttryckligen lätta set | Ingen tidsbaserad begränsning |
| Vanligt arbete i samma mönster, eller minst tre lätta set | Högst medelnivå under 24 timmar |
| Krävande/större arbete i samma mönster | Högst lätt nivå under 48 timmar |
| Krävande/större arbete i delvis överlappande mönster | Högst medelnivå under 24 timmar |

”Krävande/större” betyder minst ett maxset, minst två tunga set, minst tre set som inte uttryckligen var lätta, eller minst sex arbetsset totalt. Flera kriterier adderar inte extra tid. Maxansträngning/RIR 0 anger maxset. Tungt, äldre För tungt eller RIR 1 anger tungt. Lätt/För lätt eller RIR ≥4 anger lätt arbete, förutsatt att inget mer krävande svar motsäger det. Saknad återkoppling behandlas som vanligt/okänt arbete. Beskrivande svar skapar aldrig ett lagrat eller gissat numeriskt RIR.

Gränserna finns samlade i `src/domain/recoveryPolicy.ts`. De är produktheuristiker som behöver utvärderas i användning. De anger inte när en människa säkert är återhämtad. Efter tidsfönstret gäller den vanliga progressionens villkor; ingen automatisk bonusökning ges.

Automatisk höjning av repetitioner eller belastning hålls tillbaka medan en återhämtningsbegränsning gäller. Det gäller även maskinnivåer och två oberoende staplar. En motiverad sänkning efter upprepade missade mål tillåts fortfarande. Användaren kan ändra sina egna träningsvärden.

## Datakorrekthet

- Arbetsset räknas per sida: tre ensidiga par blir tre set per sida, inte sex.
- Bara genomförda sidprestationer räknas i ofullständiga set. Ett mål som avsiktligt bara gäller vänster sida begränsas inte av enbart högersidigt arbete.
- Nyare lätt arbete döljer inte äldre krävande arbete. Rullande tidsfönster använder varje prestations sluttid, med befintlig set-/övningstid som reserv för äldre data.
- Uppvärmning, enbart påbörjade/överhoppade set, noll utfört arbete, förhandsvisningar och framtida tidsstämplar bidrar inte.
- Äldre set utan sidinformation bedöms försiktigt för båda sidor. Historiken ändras inte för att fylla i saknade uppgifter.
- Symtomregler, användarspärrar, omstart efter längre uppehåll och belastningsjämförbarhet gäller fortsatt separat.
- Inga databaskolumner, migrationer eller nya personuppgifter. Pågående/accepterade pass och historiska förslag skrivs inte om. Nästa förslag räknas från lokal historik, även offline.

## Arkitektur och versioner

Ny ren modul: `src/domain/recoveryPolicy.ts` (`RECOVERY/2.0.0`). `planner/history.ts` förmedlar bara verkliga tidsavstånd för en fortfarande aktiv begränsning till referensmotorn. Utgångna begränsningar anges som frånvarande, inte som påhittad vila. Långt uppehåll bevarar det verkliga tidsavståndet för samma övning.

`planner/planner.ts` och den äldre bytesvägen i `application/training.ts` använder samma bedömning. `domain/prescription.ts` inkluderar dess skäl i befintliga förslag. `domain/configuredPrescription.ts` rättar maskinernas förbikoppling av `caution` vid både repetitions- och belastningsökning.

Regelversionen är `STYRKA-RULES/1.3.0`, metodversionen `STYRKA-METOD/1.4.0`. Referensmotorn ENGINE/1.0.0 är oförändrad, inklusive kontrollsumma. UI-varningen är kort och gäller den faktiska anpassningen; inga ytterligare obligatoriska frågor eller detaljpaneler införs.

## Forskningsstöd och begränsningar

Morán-Navarro et al. studerade olika volymer och ansträngningsgrader i bänkpress och knäböj hos tio träningsvana män. Träning till failure gav långsammare återhämtning av de undersökta prestationsmåtten än protokollen utan failure, även vid jämförbar total repetitionsvolym. Detta motiverar att skilja på ansträngningsgrad och mängd i en försiktig produktmodell. Det validerar inte STYRKAs gränser, rörelsegrupper eller individuella rekommendationer.

Källa: [Time course of recovery following resistance training leading or not to failure (2017)](https://pubmed.ncbi.nlm.nih.gov/28965198/), DOI 10.1007/s00421-017-3725-7. Kontrollerad 2026-10-16.

## Verifiering

- Enhet/UI: 373/373 godkända. Nya fall täcker tidsgränser, liten/stor mängd, känslosvar och saknade svar, RIR, överlapp, sidräkning, faktiska tidsstämplar, offlinehistorik, omstart, symtom och maskinprogression.
- Typkontroll, lint och produktionsbygge godkända. Befintlig varning om stor huvudbundle kvarstår (cirka 305 kB gzip).
- Referensmotor: 26/26 kontroller, båda SHA256 oförändrade.
- 2 100 planer jämförda direkt mot commit `3ec01ef`: 1 695 identiska, 405 ändrade. Alla skillnader finns i scenarier med nyligt arbete. Dessa skillnader kan även omfatta skältext; antalet ändrade planer är inte antal ändrade viktförslag. Övriga scenarier, inklusive symtom och utrustningsval, är identiska.
- Originalets kontrollsumma bevaras. Ny separat referens: `tests/unit/golden/plans_recovery_v2.json`. Reproducerbar kontroll: `node scripts/verify-recovery-regression.mjs`. Resultat: `docs/evidence/recovery/differential.json`.
- Mobil/E2E: 6/6 nya återhämtningsfall godkända i Android/Chrome- och iPhone/WebKit-emulering. Ett registrerat lätt, normalt respektive maximalt bänkpressset ger tung, medel respektive lätt nivå i nästa förslag. Samma resultat kvarstår offline och efter omladdning; nästa set kan registreras offline.
- Befintligt integrerat träningsflöde: 2/2 godkända i samma emuleringar, inklusive uppvärmning, sidregistrering, kabelmaskin, vila, offline och historik. Totalt 8 godkända mobila E2E-fall. Den första körningen av de nya testerna hade felaktiga antaganden om passmallens tunga övning och en tvetydig chip-selektor; testfallen korrigerades och samtliga sex kördes om utan produktändringar.
- Följande skärmbilder är sparade under `docs/evidence/recovery/`: `android-chrome/{easy,normal,maximal}.png` och `iphone-webkit/{easy,normal,maximal}.png`. Normalfallet i Chrome och maximalfallet i WebKit har granskats visuellt: kort återkoppling, läsbara värden och ingen horisontell klippning. Den fasta startknappen visas vid den emulerade skärmens nederkant i helsidesbilderna.
- Fysiska telefoner och faktisk iOS-PWA är inte verifierade för denna ändring.

Ingen fullständig individuell återhämtningsmodell, medicinsk bedömning eller automatisk inlärning av personliga återhämtningstider införs. Olika personer kan behöva olika anpassning även vid liknande registreringar.

## Publicering

Cloudflare-version `f8c2e87b-88b8-4f57-a2a5-87b44e0e41b1`, deployment `4dbbddab-a70b-42ae-acde-27f1276c1fc2`, 100 procent trafik. Föregående version `eb321258-011e-4b38-ab22-5770e7f1a59e` finns kvar för återställning. Ingen databasmigration behövdes.

Bygget för staging är godkänt. Sju publicerade appfiler är jämförda byte för byte via SHA256 mot det lokala stagingbygget, inklusive HTML, JavaScript, CSS och service worker. Säkerhetspolicyn pekar på rätt backend. Resultat sparas i `docs/evidence/recovery/deployment.json`.

Sex nya webbläsartester mot den publicerade appen passerar: lätt, vanligt och maximalt arbete i både Chrome/Pixel 7- och WebKit/iPhone 14-emulering. De verifierar inloggning, sparad känsla i backend, rätt nivå på nästa förslag, offline, omladdning och ny setregistrering offline, utan runtime- eller CSP-fel. Testet finns i `e2e-staging/recovery.spec.ts`; lint är godkänt. Samtliga sex tillfälliga testkonton raderades och varje exakt konto-id verifierades som borttaget (404). Inga befintliga användarkonton användes. Skärmbilder finns under `docs/evidence/recovery/staging/`. Fysiska enheter har inte verifierats.

Befintliga installationer erbjuds **Uppdatera** via appens vanliga uppdateringsnotis. Lokal träningshistorik behålls.

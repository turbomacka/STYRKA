# Separata frivilliga styrkeuppgifter

Beställt av produktägaren 2026-10-12: "Japp. Bygg det", efter konstaterandet att 1RM, 3RM och Set använde samma viktfält och skrev över varandra.

## Användarflöde

- Intro visar att steget är frivilligt och att ett värde räcker. Max för 1 repetition, max för 3 repetitioner och ett vanligt träningsset har egna fasta fält. Att lägga till en uppgift ändrar varken värdet eller tolkningen av en annan uppgift.
- Ett uppgiftsfält visas först efter uttryckligt val. Ytterligare uppgifter öppnas med "Lägg till ytterligare en uppgift". En uppgift av varje typ per övning stöds; högst tre totalt.
- Varje uppgift har vikt och frivilligt prestationsdatum. Ett träningsset har även repetitioner och frivilligt antal repetitioner kvar. Direkt lyft max skiljs från ett gissat max genom användarens uttryckliga uppgift.
- "Hoppa över – jag vet inte" finns per övning. "Hoppa över alla styrkeuppgifter" fortsätter även om något fält är ofullständigt. Inga maxförsök krävs. Utan användbart underlag väljer användaren startvikt på gymmet.
- Tillbaka/Nästa behåller formulärets oberoende värden. Att hoppa över hela steget utesluter uppgifterna vid sparandet; återbesök och ett nytt Nästa inkluderar dem igen. Ett uttryckligt Ta bort eller Hoppa över på en övning tömmer dess valda uppgifter.
- Samma editor finns i Profil → Övningar. Gamla enskilda uppskattningar visas och bevaras vid komplettering. Ta bort alla och spara rensar underlaget.

## Beräkning, policy strength-inputs/1

Befintliga formler för en repetition, tre repetitioner och set med 1–8 reps samt angivna 0–3 repetitioner kvar återanvänds. Ingen ny fysiologisk formel införs. Set utan repetitionsreserv lagras men skapar inte uppskattad maxstyrka.

Giltiga daterade observationer prioriteras. Finns datum används de giltiga observationerna inom 90 dagar före den senaste giltiga daterade observationen. Äldre och odaterade värden finns kvar men ingår inte i sammanvägningen. Om inga giltiga observationer har datum används de giltiga odaterade uppgifterna.

En enda giltig uppgift använder befintlig beräkning. Flera jämförbara värden får vikt 3 för direkt uppmätt 1RM, vikt 2 för uppgivet max eller 3RM och vikt 1 för ett träningsset. Medelvärdet får inte överstiga ett ingående 1RM och begränsas till 500 kg. Om högsta uppskattningen är mer än 15 procent över den lägsta används den lägsta med låg säkerhet. Sortering efter typ gör resultatet oberoende av inmatningsordning.

90 dagar, 3/2/1 och 15 procent är explicita produktantaganden, inte vetenskapligt validerade gränser eller en garanti om optimalt upplägg. Metodsidan förklarar detta. Ingen extra volym eller ändring av progressionen efter genomförda pass införs. UI visar när flera uppgifter används, när underlag inte ingår och när uppgifterna skiljer sig tydligt.

## Lagring och kompatibilitet

- Additiv `strength_inputs` JSONB i befintlig `user_exercise_profiles`, med max tre validerade poster och högst en per typ. Befintlig ägarstyrd RLS gäller. Ingen ny privilegierad funktion eller anonym skrivåtkomst.
- Servern kontrollerar datatyper, viktgränser, reps, repetitionsreserv, unika typer och giltiga datum. Valideringen är en invoker-funktion med låst search_path.
- Saknad kolumn/egenskap betyder äldre singeluppgift; tom array betyder uttryckligt rensad. Äldre uppgifter migreras först vid redigering, och en härledd kompatibilitetsuppskattning sparas också.
- Offlinekö och hämtning på annan enhet använder befintlig synk för övningsprofilen. JSON-export inkluderar de separata uppgifterna. Kontoradering raderar profilen och därmed uppgifterna. Passradering tar inte bort användarens grunduppgifter.
- Ingen ändring av Dexies index behövs för den nya valfria egenskapen.

## Acceptans

Testa separata värden 100 kg / 90 kg / 75 kg, redigering av ett fält utan påverkan på andra, tillbaka/framåt, offline, synk till en separat databas/enhet, omladdning, äldre profil, rensning, valfria och ofullständiga uppgifter, datum, olikheter, ägarisolering och export. Kontrollera mobilbredd, minst 48 px för datumfält och tillgänglighet.

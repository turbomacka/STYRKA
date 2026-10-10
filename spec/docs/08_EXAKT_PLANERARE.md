# 08 · Schemageneratorns deterministiska defaults

## 1. Styrande mallfil
Alla valbara standardsekvenser, övningsordningar, modetyper och grundset finns i `fixtures/planner_templates.json`. Det är en **normativ versionsstyrd mallkälla**, inte bara exempel. Värden kan påverkas av användarens personliga regler, träningsvana och tidsbudget men mallversionen måste sparas i varje sessionssnapshot. Det är avsiktligt få set vid hög frekvens; verkligt lämplig volym behöver individanpassas.

## 2. Deterministisk planeringsalgoritm
Input: användare, utrustningsuppsättning, aktiva restriktioner, lokal sekvensposition, datum/tid UTC, senaste 28 dagars relevanta genomförda set, återhämtningsmarkörer, tidsbudget och frivillig ersättningspreferens.

**Algoritm i exekveringsordning**
1. Läs `splits[weeklyFrequency]`. För en frekvens 1: välj nästa `single_*` cykliskt. För 2: välj nästa A/B/C, aldrig nollställning måndagar. För 3: A/B/C. För 4–7: sekvens i mallfilen, även om en vecka missas fortsätter index efter genomförd ordinarie session.
2. Välj `template` för aktuell rotation. Varje mallpost är `[exerciseSlug,mode,sets]`, `sets` högsta förslagna antal före prunings. Vid nybörjare max 2 per övning initialt, såvida användaren uttryckligen väljer fler och tidsbudget räcker; marklyft heavy max 2 som default.
3. Utrustning: ersätt saknad övning endast med tillgängligt alternativ inom `replacementFamilies` och samma rörelsefamilj. Om flera tillgängliga, välj användarens favoriter först, annars filordning. Ingen ersättning utanför definierad familj utan aktivt val.
4. Filtrera uttryckliga `block_exercise`; tillämpa `max_sets` och `limit_mode`. Vid mismatch skriv reason code. Om inga rimliga övningar återstår, visa neutralt tomläge.
5. Baserat på relevanta timmar från utförda pass, nedgradera tung övning som når caution gate till light eller skjuta upp och välj andra övningar, med samma order. Aldrig autohöjning om relevant caution. Vid `review_required` tas relevant rörelse bort från automatisk planering.
6. Tillämpa parbegränsningar: vid `block_pair_heavy` och två tunga, håll högst prioriterad som heavy, gör den andra light (förutsatt att användaren tillåter lätt variant). Prioritet sorteras efter explicit användarpreferens, annars dagens mallordning. Om light inte tillåten, ta bort den andra och välj annan rörelse.
7. Beräkna rekommendation för varje kvarvarande övning med `ENGINE/1.0.0`. Saknas e1RM för external_kg visas `kalibrera`; ingen siffra påhittas.
8. Kör tidsestimat. Ta bort bonusövningarna, sedan sista accessorisset från slutet, därefter kompletterande set till min 1, därefter lägst prioriterad kompletterande övning; behåll huvudlyftet om det ryms. Om huvudlyft inte ryms, visa användarvänligt besked och kortare återhämtningsalternativ utan tungt maxlyft. Beräknad total tid får högst överskrida budget med 1 minut avrundningsmarginal; annars markera ej genomförbar.
9. Återverifiera alla blockeringar, starta immutable plan snapshot med reasonCodes och engineVersion. Vid avbrutet förhandsförslag påverkas ingen rotation; först **slutfört eller partiellt genomfört ordinarie pass med minst ett arbetsset** flyttar rotationsindex.
10. Kör alltid algoritmen deterministiskt vid samma snapshot och version; inga randomiserade val.

## 3. Extra pass
Det separata `extra` målet använder rörelser utan relevant tung belastning senaste 48h som första sortering, sedan användarprioriteter och återstående träningstid. Vid dagsform `tired` max 2 set/övning och endast light/moderate; vid `pain` inga matchande övningar för berörda problemområden. `extra` ger inte automatiskt rotationssteg. Aktiv knapp `Räkna som ordinarie` visas bara om användaren explicit valt att ersätta nästa plan och detta får plats med historiska utförda huvudset.

## 4. Schemaavvikelser
Om användaren planerat fem pass men bara hinner två: applikationen visar alltid **nästa relevanta pass**, inte fem eftersläpande schemarutor. Den får föreslå att sekvensen omplaneras, men gamla träningspass går aldrig förlorade. Ändring av planerad frekvens skapar en ny programversion med ny mallsekvens från dagen för ändring; redan utförda set påverkas inte.

## 5. Bristande veckovolym
Katalogen beskriver rörelsemönster och prioritet, men vi ska inte räkna en exakt så kallad 'effektiv setkvot' mellan övningar utan validering. Programgeneratorn ska bevaka om något prioriterat baslyft inte tränats över senaste 14 dagarna och då höja prioriteten på dess nästa **tillåtna** exponering. Användarbegränsningarna kan innebära att ett mål behöver pausas; appen får inte tvinga igenom en säkerhetsmässigt otillåten exponering.

## 6. Exakt testbar regel för substitutionsförhållande
`lat_pulldown` → `assisted_pullup` är ett likvärdigt vertikalt rörelsemönster men belastningshistoriken och e1RM hålls SEPARATA. `deadlift` → `romanian_deadlift` är en föreslagen alternativ rörelse i katalogen, dock inte automatisk substitutionsgaranti vid begränsad ländrygg/knä; kräver användaraccept för känslig profil. Varje ersättning sparas som `substitutionFrom`, `reasonCode`, `acceptedByUserAt`.

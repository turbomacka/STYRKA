# STYRKA v2.0: Instruktion att ge en kodagent

Du har tillgång till en ZIP med fullständig implementeringsspecifikation, versionsstyrda programmallar, referensimplementation, SQL migrationsförslag, testscenarier och kvalitetsgrindar. Läs **README.md och samtliga docs/** innan du börjar. Skapa därefter en komplett, fungerande, mobilförst, svensk React/TypeScript PWA i ett nytt versionshanterat kodprojekt.

**Genomför självständigt allt som inte kräver kontobehörighet, betalning, produktägarbeslut eller juridiskt/fackligt godkännande.** Starta med tester för rekommendationsmotorn, därefter lokal Supabase DB med ägarisolerande RLS, atomisk setmutation med idempotens och konfliktlösning, offline IndexedDB, schemagenerator (1–7 pass per vecka), spontana pass, och slutligen det renodlade Appleinspirerade UI flödet.

Behandla H-trösklar som dokumenterade produktheuristiker. Gör ingen egen medicinsk riskberäkning. Respektera explicita restriktioner och rapporterad funktionsförsämring även när detta omöjliggör planeringsmålet. De juridiska/MDR/GDPR frågorna i releasegrind G5 ska rapporteras som nödvändiga mänskliga godkännanden, aldrig utropas som automatiskt lösta.

För varje milstolpe: implementera → kör tester → åtgärda fel → commit → rapportera kort. Visa demo med två oberoende användarkonton, 36 pass och ett spontanpass som ändrar nästa ordinarie rekommendation. Ge testresultat och motiverade avvikelser. Publicera endast till testmiljö tills produktägaren uttryckligen godkänt offentlig driftsättning.

**Inga schematiska demos som ersättning för verklig fungerande kod.** En uppgift är inte färdig förrän relevant dataåtkomst, felhantering, offline, tillgänglighet och säkerhetstest har passerat.

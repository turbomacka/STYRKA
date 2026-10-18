# Radera registrerade träningspass

Användarbeställd ändring 2026-10-12. Registrerade pass kan tas bort via Utveckling → Senaste pass eller Plan → Genomförda → öppna passet. Användaren måste bekräfta. Pågående pass måste först avslutas.

## Beteende och synk

- Lokal transaktion tar bort pass, set, övningsrader, passanteckning, rekommendationsunderlag, byteshistorik och tillhörande köposter/konflikter. Statistiken uppdateras direkt.
- Raderingen köas även offline och är idempotent vid dubbla tryck eller förlorad kvittens.
- Servern raderar innehållet atomärt via `delete_training_session`. Endast ett minimalt raderingsregister med pass-ID, ägare, eventuellt reserverat passnummer och raderingstid behålls. Inga set, vikter eller anteckningar finns i registret.
- Registret hindrar gamla klienter från att återskapa passet. Vid hämtning gäller radering före lokala ändringar och äldre serverbilder. Registret försvinner vid kontoradering.
- Rapporterade besvär behålls men kopplingen till passet tas bort, även i osynkade rapporter. Begränsningar får inte försvinna när träningshistorik städas.
- Kalibrering rensas från borttagna set och nivån sänks vid otillräckligt kvarvarande underlag. Explicit angiven vana behålls.
- Programrotation ändras inte. Reserverade passnummer gör att efterföljande pass och plananteckningar behåller sina platser.

## Databas

Migration `20261011234444_delete_training_session.sql`, skapad av CLI. RLS och endast läsrättighet för användaren på `deleted_training_sessions`. Privat, ägarkontrollerad funktion kräver inloggning; publik invoker-wrapper. Privilegier behövs för skyddat raderingsregister och oföränderliga audit-rader. Transaktionslås serialiserar radering och sena skrivningar av samma pass.

Migrationens CLI-tidsstämpel ligger före den tidigare daterade migration 007; `db push --include-all --skip-vault --dry-run` visade endast den nya migrationen före publicering. Migrationen är oberoende av 007.

## Verifiering och publicering

- Typecheck, lint och `git diff --check`: godkända.
- 282 unit/UI/databastester godkända, inklusive 6 nya applikationstester och 3 nya databasfall.
- Nytt Playwright-flöde godkänt i Android Chromium, iPhone WebKit och desktop Chromium: avbryt, bekräfta offline, tom historik/statistik, omladdning, bibehållet nästa passnummer, ingen horisontell scroll. Inga allvarliga/kritiska axe-fel i bekräftelsen.
- Lokala Supabase security advisors: inga anmärkningar. Staging advisors pekar på den befintliga `public.rls_auto_enable`, inte på denna ändrings funktioner; den funktionen ändras inte här.
- Publicerad på `https://styrka-staging.homeboard-mh.workers.dev`, Cloudflare-version `50da20b2-08df-43d7-8b76-369e88078922`.
- Efter publicering: 4 staging-webbläsartester godkända (Android/iPhone). Verifierade med syntetiska konton att radering i UI faktiskt tömmer pass och set på servern, skapar raderingsmarkör och består efter omladdning. Testkontona raderades efteråt. Första körningen hade ett fel i testets locator (synklänk saknas på Utveckling); korrigerad till kontroll av servercommit. Ingen ytterligare appändring behövdes.

Ändringarna är inte committade eller pushade till Git.

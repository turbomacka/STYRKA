# Separata styrkeuppgifter

Genomfört 2026-10-12 enligt produktägarens beställning. Produktregler och beräkningspolicy finns i `spec/STYRKA_andringsanmodan_styrkeuppgifter_2026-10-12.md`.

## Leverans

- 1RM, 3RM och ett träningsset har egna värden och frivilliga datum i både intro och profil. Att lägga till en annan uppgift återanvänder aldrig vikten från ett annat fält.
- Ett värde räcker. Fler läggs till uttryckligen. Enskild övning eller hela steget kan hoppas över, även med ofullständiga fält. Saknat underlag tvingar inte fram maxlyft.
- Jämförbara uppgifter används i en försiktig sammanvägning, med befintliga formler. Nya skäl och metodavsnitt förklarar sammanvägning respektive tydlig oenighet. Produktens val av vikter, tidsfönster och gräns redovisas som antaganden.
- Additiv migration `20261012123334_independent_strength_inputs.sql`: separat JSONB-underlag på den befintliga övningsprofilen. Äldre profiluppgifter bevaras, och offlinekö, synk, export och kontoradering omfattar det nya underlaget. Tom array betyder uttryckligt rensat underlag.
- Typkontroll och servervalidering hindrar dubbletter, ogiltiga datum och felaktiga värden. Befintlig ägarstyrd RLS gäller. Inga nya SECURITY DEFINER-funktioner.

## Verifiering

- Typecheck, lint och diffkontroll godkända.
- Hela unit/UI/databassviten: 308 tester godkända i 32 filer, inklusive 10 nya tester för separat underlag och två nya databastester.
- Verklig synk mellan två separata lokala databaser/enheter kontrollerad, inklusive gamla profiler, offlinekö, rensning, ägarisolering och validering på servern.
- Nio lokala Playwright-fall godkända i Android Chromium, iPhone WebKit och desktop Chromium: separata fält, tillbaka/framåt, sparande offline, profilredigering, omladdning, hoppa över en/alla samt det tidigare flödet för överhoppade övningar.
- Ingen horisontell scroll eller allvarlig/kritisk axe-anmärkning i den nya introduktionen. Datumfält minst 48 px högt. iPhone-skärmbild visuellt kontrollerad; datumfältet och grupprubrikerna justerades efter första granskningen.
- Lokal Supabase säkerhetskontroll utan anmärkning. Staging har samma tidigare anmärkningar för `public.rls_auto_enable` och skydd mot läckta lösenord; inget nytt gäller denna ändring.

## Publicering

Migrationen applicerades på lokal databas och staging. Dry-run visade enbart den avsedda migrationen.

- Adress: https://styrka-staging.homeboard-mh.workers.dev
- Cloudflare-version: `51d6b72c-e126-415f-a7f3-128582e36caf`.
- JavaScript: `index-Bz_z2tjB.js`; CSS: `index-CwWN57Dr.css`.
- `npm.cmd run deploy:staging` godkänd. Befintlig varning om stor JavaScript-bunt kvarstår.
- Efter publicering: fyra staging-tester godkända i Android- och iPhone-format. Syntetiska konton sparade 100 kg 1RM, 90 kg 3RM och 75 kg × 6 med en repetition kvar som tre separata serverposter i underlagsfältet. Värdena kontrollerades via användarens eget API och i Profil efter omladdning. Inloggning, pass, överhoppsförslag, passradering och publik metodsida godkända. Testkontona raderades efteråt.

Ändringarna är inte committade eller pushade till Git.

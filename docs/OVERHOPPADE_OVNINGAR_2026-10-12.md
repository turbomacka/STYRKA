# Överhoppade övningar och nästa pass

Genomfört och publicerat 2026-10-12 enligt produktägarens godkännande av frivilliga orsaker och begripliga förslag för nästa pass. Produktregler finns i `spec/STYRKA_andringsanmodan_overhopp_2026-10-12.md`.

## Användarflöde

- I Träna kan återstående arbetsset hoppas över med Hann inte, Utrustningen upptagen, Besvär eller utan angiven orsak. Redan gjorda set bevaras. Orsaken kan ändras. Vid avslut finns även ett frivilligt val för helt ogjorda övningar.
- Tidsbrist eller upptagen utrustning kan ge ett förslag för en helt ogjord övning från senaste avslutade passet. Förslaget visar vad som tillkommer, vad som ersätts, dos och uppskattad tid. Användaren måste godkänna och kan ångra fram till passtart.
- Exakt en kompletterande, icke prioriterad övning kan ersättas i nästa pass. Huvudövning och övriga övningars nivå och setantal bevaras. Efterföljande pass följer grundrotationen.
- Besvär, ej angiven orsak och delvis utförda övningar ger ingen automatisk uppsamling. En övning som redan ingår i nästa pass får inga extra set. Missade moment samlas inte till en växande träningsskuld.
- Befintliga regler för belastning, återhämtning, utrustning, begränsningar och tidsbudget gäller. Viktprogressionen ändras inte i denna leverans.

## Lagring och driftsäkerhet

Additiv Dexie-version 5 och migration `20261012084242_exercise_skip_events.sql`, applicerad lokalt och på staging. Ägarstyrd RLS och oföränderliga händelser för orsak, godkännande och återkallande. Besvär kräver befintligt hälsosamtycke. Förslaget revalideras vid godkännande och ett återkallat förslag får inte startas från en gammal förhandsvisning.

Offlinekö, synk mellan enheter, export, radering av hälsodata och radering av träningspass omfattar de nya händelserna. Anpassade snapshots anger planerare 1.1.0; grundplaner utan valet behåller tidigare resultat.

## Verifiering

- Typecheck, lint och `git diff --check`: godkända.
- Senaste hela unit/UI/databaskörningen: 294 godkända tester. Efter de sista mindre ändringarna och två ytterligare fall: 20 riktade tester godkända, inklusive samtliga 12 tester för överhopp, evidensregistret och jämförelsen av 2 100 befintliga grundplaner.
- Två nya databastester verifierar verklig synk mellan två lokala enheter, ägarisolering, immutabilitet, samtycke och raderingskaskad.
- Nio lokala Playwright-fall godkända för överhopp, passradering och planvisning i Android Chromium, iPhone WebKit och desktop Chromium. Överhoppsflödet omfattar offline, förhandsförslag, godkännande, omladdning, planvisning och ångra samt kontroll av tillgänglighet och sidbredd. Mobilskärmbild granskad visuellt.
- Lokala Supabase security advisors: inga anmärkningar. Staging har kvar tidigare anmärkningar för `public.rls_auto_enable` och avstängt skydd mot läckta lösenord. Ingen anmärkning gäller den nya tabellen eller funktionerna.

## Publicering och kontroll av publicerad app

- Adress: https://styrka-staging.homeboard-mh.workers.dev
- Cloudflare-version: `d777bde8-3026-4d48-b4f5-d0e061fedd3c`.
- `npm.cmd run deploy:staging`: godkänd. Befintlig varning om stor JavaScript-bunt kvarstår.
- `npx.cmd playwright test -c playwright.staging.config.ts`: fyra godkända tester efter publicering, i Android- och iPhone-format. Syntetiska konton verifierade inloggning, intro, pass, sparade överhopps- och godkännandehändelser på servern, passradering inklusive de nya händelserna samt beständig radering efter omladdning. Publik metodsida kontrollerades också. Inga upptäckta CSP-fel; testkontona raderades efteråt.

Ändringarna är inte committade eller pushade till Git.

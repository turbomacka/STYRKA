# 09 · Atoma händelser, revisioner och konfliktlösning

Denna detaljspecifikation är bindande för kodagentens implementation av `applySetMutation`. En vanlig serie av flera REST anrop räcker inte: skrivning av set och idempotenskvitto måste ingå i samma DB transaktion.

## 1. Funktionskontrakt
**Anrop** `applySetMutation(eventId: UUID, setId: UUID, baseRevision: number|null, payload: SetPayload)` över HTTPS med Supabase JWT. Servern härleder `user_id` **endast** från verifierad auth identity, aldrig från klientpayload. `payload` får innehålla `sessionExerciseId` endast vid skapande, samt `ordinal`, `kind`, `status`, `targetKg`, `targetReps`, `actualKg`, `actualReps`, `actualSeconds` för tidsövning, `rir`, `technique`, `occurredAt`. Ändring av parent eller ägare efter skapande är förbjuden.

**Return:** `{status: applied|duplicate|conflict|rejected, recordId, revision, serverTime, code}`. Klienten använder stabilt UUID per användarhandling och behåller det vid retry.

## 2. Atomisk transaktionsordning
1. Autentisera användaren och verifiera giltigt sessionstoken; annars 401.
2. Validera schema, numeriska gränser, att utfört set har `actualReps` eller `actualSeconds` enligt övningstyp och tidsstämpel; annars 422.
3. Sätt DB advisory lock på `eventId` eller använd unik `mutation_receipts.event_id` med transaktionskontroll för samtidighet.
4. Om kvitto för `eventId` finns och `payload_hash` matchar returnera `duplicate` med befintlig revision och samma post. Om samma eventId återanvänds med annat innehåll → 409 `EVENT_REUSE_MISMATCH`, aldrig ändra den första posten.
5. Kontrollera att `sessionExerciseId` refererar till en session som ägs av auth.uid; neka alltid annan användares resurser utan att avslöja om de existerar. Ägarvillkoret används även på update och delete.
6. Skapande kräver `baseRevision=null` och ännu inte existerande `setId`. Insert med serverhärlett ägarskap och revision 1. Uppdatering kräver `baseRevision == currentRevision`, annars `REVISION_CONFLICT` och returnera minimal säker metadata för konfliktvy.
7. `UPDATE` får ändra endast tillåtna attribut. Ändringar på rekommendationssnapshot eller tidigare skapad sessionsägare accepteras aldrig.
8. Skriv kvitto med hash över kanoniserad payload och serverstämpel inom samma DB transaktion; commit.
9. Returnera ack efter commit. Vid transaktionsfel rullas både set och kvitto tillbaka.
10. Samma setId med ett nytt eventId och korrekt revision är en ny ändring, inte en duplicate; konfliktlösning visar båda versionerna vid revision mismatch.

## 3. Teoretiskt samtidighetstest
En klient A skickar event X för set S revision 1. Server skriver S revision 2 och kvitto X. Nätet bryts före ack. A skickar X igen: `duplicate`, revision 2. Klient B har ändrat S revision 2 till 3 medan A offline försöker ändra med expected revision 2: `conflict`, B:s data bevaras tills användaren väljer vilken version som ska gälla.

## 4. Privacy first
Kvitto lagrar aldrig full medicinsk text, endast `event_id`, ägare, id, payloadhash, tid och status. Användarens symptom får aldrig placeras i URL querystring eller frontendtelemetri. Löptid för kvitton dokumenteras; idempotensgaranti måste omfatta en realistisk offlineperiod (minst 90 dagar). Exakt policy för borttag efter 90 dagar och effekter på sen synk ska testas innan publicering.

## 5. SQL implementation
Använd serveroperation med DB transaktion, ingreppsspecifikt least privilege och säker parametrisering. Om plpgsql `SECURITY DEFINER` verkligen behövs ska funktionen skyddas med `SET search_path = ''`, tydlig ägarkontroll via `auth.uid()`, restriktiva grants och specifika regressionstester. Skapa aldrig godtycklig säkerhetsdefinerfunktion i exponerat schema utan manuell säkerhetsgranskning. Funktionens exakta SQL beror på vald Supabase runtime, därför är `db/001_schema.sql` ett **schemaförslag** och detta funktionskontrakt är den normativa regeln. Releasegrind G3 och G4 kräver körda DB tester, inte enbart läst SQL.

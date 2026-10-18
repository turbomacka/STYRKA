# Lokala prestandadiagnoser

Före → efter, ett inspelat flöde per miljö/tema. Samma arbetsstation, Playwright, lokal backend. Mobilnamnen avser desktopemulering.

| Miljö | Klick till synligt registrerat set, ms | Längsta observerade interaction-event, ms | Observerad CLS |
|---|---:|---:|---:|
| android-chrome / light | 69 → 82 | 40 → 48 | 0 → 0 |
| android-chrome / dark | 67 → 68 | 40 → 40 | 0 → 0 |
| iphone-webkit / light | 401 → 361 | 24 → 40 | Stöd ej verifierat → Ej tillgängligt |
| iphone-webkit / dark | 404 → 400 | 40 → 40 | Stöd ej verifierat → Ej tillgängligt |
| desktop-keyboard / light | 76 → 95 | 48 → 48 | 0 → 0 |
| desktop-keyboard / dark | 65 → 95 | 48 → 48 | 0 → 0 |

Klickmåttet inkluderar Playwrights väntan, automation och rendering, inte enbart appens arbete. Event Timing har gräns 16 ms och flera events kan tillhöra samma interaktion. Tabellen redovisar därför maximalt observerat event, inte INP eller dess 75:e percentil. API-stöd varierar mellan webbläsarna; saknade mätserier eller overifierat stöd markeras uttryckligen. CLS exkluderar förväntade förskjutningar direkt efter användarinmatning. Inget av måtten bevisar jämn bildfrekvens eller prestanda på en fysisk telefon.

Rådata finns i varje tema/miljös lab.json. Inga mätningar samlas in i den levererade appen. Verkligt INP p75, PWA-start, skrollning och energibeteende kräver representativa enheter.

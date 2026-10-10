# 05 · Evidensregister, tolkningar, regulatoriska gränser

## 1. Forskningsfråga och kunskapshierarki
STYRKA ska stödja **ökad styrka**, med 1RM och faktisk repetition vid standardiserad last som viktiga resultat. Många randomiserade träningsstudier omfattar friska vuxna under veckor/månader och ger begränsat underlag för exakta individuella råd vid skador, hög ålder eller hög belastningstoleransvariation. Vi ska därför skilja:

- **E1 (stöd från systematiska sammanställningar):** progressiv styrketräning förbättrar maximal styrka, tyngre belastning och övningsplacering tidigt i passet kan vara gynnsamt, regelbunden exponering av relevanta muskler viktig.
- **E2 (indirekt stöd/extrapolation):** kalibrering, övningsspecifik kapacitet, hantera trötthet och submaximala set, individualiserad träning vid problemområden.
- **H (produktheuristik):** exakt 65/77,5/82,5 procent start, väntan på 2 pass utan RIR, ökningar 5/5/3 procent, 24/48 h gates, 13/28 dagar, specifika tidskostnader, exakta setomfång. H har ingen bevisad universell optimalitet.
- **U (användarens explicita val):** förbud, prioriterade övningar, träningstider, godkända alternativ.

## 2. Kontrollerade och verifierade primärkällor
**R1.** Currier BS m.fl. (2026). *ACSM Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews.* Med Sci Sports Exerc 58(4), 851–872. DOI: 10.1249/MSS.0000000000003897. 137 systematiska översikter, fler än 30 000 deltagare. För maximal styrka gynnas på gruppnivå ≥80 % av 1RM och 2–3 set, övningen tidigt, minst 2 pass/vecka. **Applicerbarhet:** friska vuxna; ej garanterade individuella parametrar. https://pubmed.ncbi.nlm.nih.gov/41843416/

**R2.** Pelland JC m.fl. (2026 online 2025-12-04). *The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains.* Sports Med 56, 481–505. DOI: 10.1007/s40279-025-02344-w. Dosrespons med avtagande marginalnytta. Meta-regression kan inte identifiera exakt individuell optimum. https://pubmed.ncbi.nlm.nih.gov/41343037/

**R3.** Currier BS m.fl. (2023). *Resistance training prescription for muscle strength and hypertrophy in healthy adults: a systematic review and Bayesian network meta-analysis.* Br J Sports Med. PMID 37414459. 178 studier i styrkenätverket; högre last prioriterad för 1RM styrka, varierande recept bättre än inget. https://pubmed.ncbi.nlm.nih.gov/37414459/

**R4.** Zhang X m.fl. (2021). *Auto-Regulation Method vs. Fixed-Loading Method in Maximum Strength Training for Athletes: A Systematic Review and Meta-Analysis*. Front Physiol 12:651112. Endast 8 studier / 166 deltagare: begränsad generaliserbarhet. https://pubmed.ncbi.nlm.nih.gov/33776802/

**R5.** *The Effect of Load and Volume Autoregulation on Muscular Strength and Hypertrophy: A Systematic Review and Meta-Analysis* (2022). Sports Med Open. Autoreglering är ett möjligt alternativ, superiority inte säkert. https://link.springer.com/article/10.1186/s40798-021-00404-9

**R6.** Moseng T m.fl. (2024). *EULAR recommendations for the non-pharmacological core management of hip and knee osteoarthritis: 2023 update.* Ann Rheum Dis 83, 730–740. DOI: 10.1136/ard-2023-225041. Träning med lämplig, individualiserad dos och progression. **Begränsning:** knäartros ≠ alla knäskador; gäller inte automatiskt isolerad broskbrist. https://pmc.ncbi.nlm.nih.gov/articles/PMC11103326/

**R7.** NICE NG226 (2022). *Osteoarthritis in over 16s: diagnosis and management*. Individuellt anpassad terapeutisk träning och rådgivning. https://www.nice.org.uk/guidance/ng226/chapter/Recommendations

**R8.** Tung MJY m.fl. (2024). *Injuries in weightlifting and powerlifting: an updated systematic review*. BMJ Open Sport Exerc Med 10:e001884. Skadeområden och observationer från tävlings-/styrkelyft är inte direkt prevalens för vanliga gymbesökare. https://bmjopensem.bmj.com/content/10/4/e001884

**R9.** W3C. WCAG 2.2 criterion 2.5.8 (AA) minst 24×24 CSS px eller avståndsundantag; vår 48×48 är strängare användbarhetsmål. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum

**R10.** Supabase. RLS dokumentation, aktuell oktober 2026. Exponerade tabeller ska ha RLS samt egna grant/policies. Testa tillåt/nekad åtkomst. https://supabase.com/docs/guides/database/postgres/row-level-security

**R11.** MDN. Browser Storage quotas and eviction. IndexedDB kan raderas; även persist() är browserberoende. Offlinekö behöver serversynk och konsekvent status. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

**R12.** European Commission MDCG 2019-11 rev.1 (2025-06-17). Qualification and classification of software under EU MDR and IVDR. Intended purpose avgör medicinteknisk gräns; extern regulatorisk granskning innan marknadsföring. https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en

## 3. Kritiska metodfrågor
1. **Skadehistorik:** vi har evidens för individuell anpassning, inte för en räknad individuell skaderisk från historik av vikt och set. Algoritmen får inga numeriska riskprocent.
2. **Ålder och kön:** dessa är inte givna linjära modifiers i första versionen. Ålder kan registreras frivilligt för framtida utvärdering men får inte skapa obevisade reduktionsfaktorer.
3. **Nybörjare:** lättare start är försiktighetsheuristik; snabbare progression beror på observerad prestation, inte identitet som nybörjare ensam.
4. **Tilldelning av nya övningar:** ersättningsregler bygger på biomekaniska mönster och utrustning och ska testas praktiskt; klassificering garanterar inte medicinsk tolerans.
5. **Effekt:** UI-statistik över e1RM är en approximation; för vetenskaplig evidens krävs valid mätning, kontroll/jämförelse och generaliserbar studiepopulation.
6. **Vilotider:** inget enkelt fysiologiskt optimum kan beräknas från antal timmar sedan ett tidigare pass; våra tidsgränser är försiktiga rutiner.
7. **Transparens:** alla rekommendationsregler märkta E1/E2/H/U; inget språk som antyder att exakta viktprocent kommer direkt ur metaanalys.

## 4. Regulatoriska beslut att dokumentera före extern lansering
**RD01** Avsett ändamål på svenska/engelska; juridisk analys av medicinteknisk gräns, särskilt anpassning utifrån symtom. **RD02** Register över datakategorier, laglig grund för träningsdata, artikel 9 grund för frivilliga hälsodata. **RD03** DPIA screening och eventuell DPIA. **RD04** DPA för Supabase/host, EU lagring/överföringar. **RD05** User consent flows och separat radering. **RD06** säkerhetsgranskning och incidentrutin. **RD07** dokumentation av medverkande idrottsmedicinsk eller legitimerad fackgranskare för säkerhet. Dessa är lanseringsgrindar, inte kodberoenden som automatiskt löses genom README.

## 5. Beslut om vad vi inte säger
Appen säger inte 'vår algoritm förebygger skador', '72 timmar är alltid optimal vila', 'du är återhämtad eftersom det gått tre dagar', '3RM ger exakt 1RM', 'din knäskada är läkt' eller '100 % forskningsbaserad personlig optimal träningsdos'. Den säger i stället 'förslag baserat på din registrerade träning och valda inställningar' med tydlig kontroll för osäkerhet.

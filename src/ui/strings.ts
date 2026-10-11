/** Svenska UI-texter. Koderna i första blocket är normativa enligt 10 §2. */
export const T = {
  CTA_START: 'Starta dagens pass',
  CTA_EXTRA: 'Spontanpass',
  CTA_LOG: 'Klart',
  CTA_EDIT: 'Ändra set',
  CTA_UNDO: 'Ångra',
  TITLE_NEXT: 'Föreslaget pass',
  TITLE_PR: 'Utveckling',
  INFO_PREVIOUS: 'Senast',
  INFO_RECOMMEND: 'Rekommenderat',
  INFO_1RM: 'Uppskattad maxstyrka',
  WARN_CAL: 'Vi behöver först hitta en lämplig arbetsvikt. Välj en hanterbar vikt och testa lugnt.',
  WARN_TIME: 'Det föreslagna passet ryms inte inom vald tid. Vi har kortat kompletteringen.',
  WARN_REVIEW: 'Du har rapporterat besvär som påverkar funktionen. Vi pausar automatisk belastningsökning för berörda övningar. Vid kvarstående eller återkommande besvär bör du kontakta vården.',
  WARN_OFFLINE: 'Du tränar offline. Passets uppgifter sparas lokalt och synkroniseras när anslutningen fungerar.',
  WARN_UNSAVED: 'Setet kunde inte sparas på enheten. Försök igen.',
  WARN_CONFLICT: 'Det här setet har ändrats på en annan enhet. Välj vilken version du vill behålla.',
  INFO_REASONS: 'Varför det här förslaget?',
  INFO_ESTIMATE: 'Det här är en uppskattning som förbättras med dina träningsresultat.',
  CTA_EXPORT: 'Exportera mina uppgifter',
  CTA_DELETE_HEALTH: 'Radera mina hälsorelaterade uppgifter',
  CTA_DELETE_ACCOUNT: 'Radera konto och träningshistorik',

  // Kompletterande texter
  WARN_NO_FULL_SCHEDULE: 'Inget fullt schema möjligt med aktuella begränsningar. Vi visar de övningar som är tillåtna.',
  WARN_TIME_INSUFFICIENT: 'Tiden räcker inte för huvudövningen med full vila. Här är ett kortare alternativ utan tunga set.',
  WARN_EMPTY: 'Det finns inga övningar som passar dina nuvarande begränsningar och rapporterade besvär. Du kan ändra dina begränsningar själv, eller vila i dag.',
  WARN_PAIN: 'Du har angett ont i dag. Avstå övningar som provocerar besvären. Vid kvarstående eller återkommande besvär bör du kontakta vården.',
  WARN_RECOVERY: 'Du har nyligen tränat samma rörelse. Vi föreslår lättare belastning och ingen ökning den här gången.',
  SAVED_LOCAL: 'Sparat på enheten',
  SAVED_QUEUED: 'Sparas när du är uppkopplad',
  SAVED_SYNCED: 'Synkat',
  SAVE_FAILED: 'Kunde inte sparas',
  SAVE_CONFLICT: 'Konflikt – välj version',
  DISCLAIMER: 'Förslag baserat på din registrerade träning och valda inställningar. Du kan alltid minska eller avstå. STYRKA ställer inga diagnoser och ersätter inte vård.',
} as const;

export const MODE_SV = { heavy: 'Tung', moderate: 'Medel', light: 'Lätt' } as const;
export const EXPERIENCE_SV = { novice: 'Nybörjare', intermediate: 'Van', experienced: 'Mycket van' } as const;
export const READINESS_SV = { good: 'Bra', normal: 'Normal', tired: 'Trött', pain: 'Ont' } as const;
export const STATUS_SV = { preview: 'Förhandsvisning', in_progress: 'Pågår', paused: 'Pausat', completed: 'Genomfört', partial: 'Delvis genomfört', abandoned: 'Avbrutet' } as const;
export const CONFIDENCE_SV = { unknown: 'Okänd', low: 'Låg säkerhet', medium: 'Medel säkerhet', high: 'Uppmätt' } as const;
export const REACTION_SV = { baseline: 'Som vanligt', transient: 'Tillfälligt ömt, gick över', persistent: 'Kvarstående besvär', limping: 'Haltar', swelling: 'Tydlig svullnad', unknown: 'Vet inte' } as const;
export const SIDE_SV = { left: 'Vänster', right: 'Höger', both: 'Båda', not_applicable: 'Ej relevant' } as const;
export const TEMPLATE_SV: Record<string, string> = {
  A: 'Pass A – knäböj och bänk',
  B: 'Pass B – bänk och marklyft',
  C: 'Pass C – marklyft och press',
  single_A: 'Helkropp A',
  single_B: 'Helkropp B',
  single_C: 'Helkropp C',
  lower_squat: 'Underkropp – knäböj',
  upper_bench: 'Överkropp – bänk',
  lower_deadlift: 'Underkropp – marklyft',
  upper_press: 'Överkropp – press',
  upper_pull: 'Överkropp – drag',
  mixed_light: 'Lätt blandat pass',
  short_accessories: 'Kort kompletteringspass',
};

type Ev = 'E1' | 'E2' | 'H' | 'U';
/** Skälkod → förklaring och evidensklass (05 §1, §3 p7). H = produktheuristik, inte vetenskapligt validerad tröskel. */
export const REASONS: Record<string, { text: string; ev: Ev }> = {
  INITIAL_HEURISTIC: { text: 'Startvikten är en försiktig andel av din uppskattade maxstyrka.', ev: 'H' },
  ROUNDED_DOWN_TO_EQUIPMENT: { text: 'Avrundat nedåt till ditt minsta viktsteg.', ev: 'H' },
  CALIBRATION_REQUIRED: { text: 'Vi har ingen uppskattning för övningen. Välj själv en hanterbar vikt.', ev: 'U' },
  CALIBRATED_FROM_USER_WEIGHT: { text: 'Bygger på vikten du själv valde senast.', ev: 'U' },
  CALIBRATED_FROM_USER_DURATION: { text: 'Bygger på tiden du klarade senast.', ev: 'U' },
  DERIVED_FROM_OTHER_MODE: { text: 'Härlett nedåt från din arbetsvikt i en tyngre variant av samma övning.', ev: 'H' },
  DOUBLE_PROGRESS_REPS: { text: 'Du klarade alla mål – en repetition till per set, samma vikt.', ev: 'E1' },
  DOUBLE_PROGRESS_WEIGHT: { text: 'Du klarade toppen av repetitionsintervallet – vikten ökar ett steg och repetitionerna börjar om.', ev: 'E1' },
  ASSISTANCE_REDUCED: { text: 'Mindre assistans betyder mer egen styrka – det är progression.', ev: 'H' },
  ASSISTANCE_AT_MINIMUM: { text: 'Assistansen är redan på maskinens minsta värde.', ev: 'U' },
  ASSIST_STEP_TOO_LARGE: { text: 'Nästa assistanssteg vore ett för stort hopp. Vi håller kvar.', ev: 'H' },
  BODYWEIGHT_UNKNOWN_HOLD: { text: 'Utan kroppsvikt kan vi inte bedöma ett rimligt viktsteg. Öka själv om du vill.', ev: 'H' },
  DURATION_INCREASED: { text: 'Fem sekunder längre än förra gången.', ev: 'H' },
  DURATION_AT_MAX: { text: 'Du är på högsta tid för övningen.', ev: 'H' },
  WAIT_FOR_SECOND_CONFIRMED_PASS: { text: 'Utan angivna reps kvar väntar vi på ett andra lyckat pass innan ökning.', ev: 'H' },
  LOW_RIR_HOLD: { text: 'Du hade 0–1 reps kvar. Vi höjer inte den här gången.', ev: 'H' },
  FIRST_MISS_HOLD: { text: 'Ett mål missades. Vi håller vikt och repetitioner.', ev: 'H' },
  TWO_CONSECUTIVE_MISSES: { text: 'Två pass i rad under målet. Vikten sänks ett steg.', ev: 'H' },
  PARTIAL_NOT_FAILURE: { text: 'Förra passet avslutades tidigt. Det räknas inte som misslyckande.', ev: 'H' },
  TECHNIQUE_NOT_CONTROLLED: { text: 'Tekniken markerades som dålig. Ingen ökning.', ev: 'U' },
  STEP_EXCEEDS_PROGRESS_CAP: { text: 'Minsta viktsteg är för stort för en försiktig ökning. Mindre viktsteg behövs – du kan ändra själv.', ev: 'H' },
  RECOVERY_HOLD: { text: 'Kort tid sedan samma rörelse. Ingen ökning den här gången.', ev: 'H' },
  RECOVERY_UNDER_24H: { text: 'Mindre än ett dygn sedan relevant träning.', ev: 'H' },
  RECOVERY_24_TO_48H: { text: '1–2 dygn sedan relevant träning.', ev: 'H' },
  NORMAL_TIME_WINDOW: { text: 'Normalt tidsintervall sedan senaste träning. Ingen extra ökning för vila.', ev: 'H' },
  NO_RELEVANT_HISTORY: { text: 'Ingen tidigare träning av övningen registrerad.', ev: 'H' },
  NO_EXPOSURE_YET: { text: 'Första gången med den här föreskriften.', ev: 'H' },
  RESTART_AFTER_13D: { text: 'Mer än 13 dagar sedan senast – försiktig omstart med 5 % lägre vikt.', ev: 'H' },
  RESTART_28D: { text: 'Fyra veckor eller mer sedan senast – försiktig omstart med 10 % lägre vikt och ett set färre.', ev: 'H' },
  TRANSIENT_SYMPTOM_HOLD: { text: 'Du rapporterade tillfälliga besvär. Ingen ökning förrän nästa besvärsfria pass.', ev: 'H' },
  SYMPTOM_REVIEW_REQUIRED: { text: 'Rapporterade besvär i området. Övningen ingår inte i automatiska förslag.', ev: 'U' },
  USER_BLOCK_EXERCISE: { text: 'Du har blockerat övningen.', ev: 'U' },
  USER_LIMIT_SETS: { text: 'Begränsat antal set enligt din regel.', ev: 'U' },
  USER_LIMIT_MODE: { text: 'Begränsad belastningsnivå enligt din regel.', ev: 'U' },
  USER_RESTRICTION: { text: 'Utesluten av din begränsning.', ev: 'U' },
  USER_CHOSEN_VARIANT: { text: 'Din valda variant av rörelsen.', ev: 'U' },
  USER_SWAP: { text: 'Du valde att byta övning.', ev: 'U' },
  USER_MAX_LOAD_CAP: { text: 'Begränsad av ditt angivna maxlasttak.', ev: 'U' },
  EQUIPMENT_SUBSTITUTION: { text: 'Ersatt med likvärdig rörelse eftersom utrustning saknas.', ev: 'E2' },
  PAIR_RULE_DOWNGRADED: { text: 'Din regel tillåter inte två tunga övningar tillsammans – den här blir lätt.', ev: 'U' },
  PAIR_RULE_REMOVED: { text: 'Din kombinationsregel gjorde att övningen togs bort.', ev: 'U' },
  RECENT_LOWER_HEAVY: { text: 'Du tränade underkroppen nyligen. Ingen ny tung belastning i samma rörelse.', ev: 'H' },
  RECENT_PATTERN_WORK: { text: 'Du tränade samma rörelsemönster nyligen.', ev: 'H' },
  HEAVY_DOWNGRADED_TO_LIGHT: { text: 'Tung variant ändrad till lätt.', ev: 'H' },
  RECENT_HEAVY_PATTERN: { text: 'Tung träning i samma mönster senaste två dygnen.', ev: 'H' },
  NOVICE_MAX_SETS: { text: 'Som nybörjare börjar du med högst två set per övning.', ev: 'H' },
  PRIORITY_LIFT_OVERDUE_14D: { text: 'Prioriterat baslyft som inte tränats på två veckor.', ev: 'H' },
  SENSITIVE_PROFILE_SINGLE_LOWER_LIFT: { text: 'Med din notering om underkroppen ingår bara en av knäböj och marklyft.', ev: 'U' },
  TIME_SETS_REDUCED: { text: 'Färre set för att rymmas i vald tid.', ev: 'H' },
  TIME_MAIN_LIFT_SHORT_ALTERNATIVE: { text: 'Kortare alternativ utan tunga set eftersom tiden inte räcker för full vila.', ev: 'H' },
  EXTRA_SESSION: { text: 'Spontanpass – räknas in i din belastningshistorik.', ev: 'H' },
  LEAST_RECENT_PATTERN: { text: 'Rörelsemönster du tränat minst på sistone.', ev: 'H' },
  PREFERRED_MOVEMENT: { text: 'En av dina favoritövningar.', ev: 'U' },
  LOAD_RECOMMENDATIONS_DISABLED: { text: 'Viktförslag är tillfälligt avstängda – du väljer vikt själv.', ev: 'U' },
  EQUIPMENT_UNAVAILABLE: { text: 'Utrustning saknas och ingen likvärdig ersättning finns.', ev: 'U' },
  SUBSTITUTION_REQUIRES_ACCEPT: { text: 'Ersättningen kräver ditt aktiva val eftersom du har en notering om området.', ev: 'U' },
  DUPLICATE_AFTER_SUBSTITUTION: { text: 'Övningen fanns redan i passet.', ev: 'H' },
  TIME_PRUNED_BONUS: { text: 'Bonusövning borttagen för att rymmas i tiden.', ev: 'H' },
  TIME_PRUNED_ACCESSORY: { text: 'Kompletterande isolationsövning borttagen för att rymmas i tiden.', ev: 'H' },
  TIME_PRUNED_SUPPLEMENTARY: { text: 'Kompletterande övning borttagen för att rymmas i tiden.', ev: 'H' },
  READINESS_PAIN_AREA: { text: 'Belastar området där du angav att du har ont i dag.', ev: 'U' },
  NO_RECENT_HEAVY_FLAG: { text: 'Ingen tung träning i mönstret senaste två dygnen.', ev: 'H' },
  // Övningsbyte (STYRKA-CR-2026-10-10-01). Relationerna är ett redaktionellt urval (H), inte bevis för likvärdig effekt.
  SUB_RELATION_NEAR_VARIANT: { text: 'Nära variant av den planerade övningen: liknande teknik, men styrkan är övningsspecifik.', ev: 'H' },
  SUB_RELATION_MOVEMENT_FAMILY: { text: 'Samma rörelsefamilj: delvis överlapp, ingen direkt överföring av maxvikt.', ev: 'H' },
  SUB_RELATION_ACCESSORY: { text: 'Kompletterande alternativ: delvis träningsstimulus, inte likvärdigt för det ursprungliga styrkemålet.', ev: 'H' },
  SUB_TARGET_OBSERVED: { text: 'Vikten bygger på din egen historik i den här övningen.', ev: 'U' },
  SUB_TARGET_ESTIMATED: { text: 'Vikten bygger på din egen uppskattning av maxstyrkan i den här övningen.', ev: 'U' },
  SUB_CALIBRATION: { text: 'Vikten bygger på din kalibrering i den här övningen.', ev: 'U' },
  SUB_POPULATION_PRIOR_LOW_CONFIDENCE: { text: 'Uppskattning med låg säkerhet från en genomsnittlig skillnad i en liten studie – inte från dig. Bekräfta vikten med ett kontrollerat första set.', ev: 'H' },
  SUB_NO_ESTIMATE: { text: 'Ingen tillförlitlig vikt ännu. Du väljer en lätt, kontrollerad vikt.', ev: 'U' },
  SUB_NEW_MACHINE_PROFILE: { text: 'Annan maskin – egen historik, inga kilo förs över.', ev: 'U' },
  SUB_REVERT_TO_ORIGINAL: { text: 'Tillbaka till den ursprungligen planerade övningen.', ev: 'U' },
  CALIBRATION_EFFORT_TOO_HEAVY: { text: 'Du angav att setet var för tungt – ett viktsteg lättare.', ev: 'H' },
  CALIBRATION_CONTINUE_SAME_WEIGHT: { text: 'Samma vikt som ditt senaste set – ingen automatisk ökning inom passet.', ev: 'H' },
  CALIBRATED_TWO_EXPOSURES: { text: 'Övningen räknas som kalibrerad efter två kontrollerade pass.', ev: 'H' },
};

/** Texter för övningsbyte (CR §2.1, §3.3). */
export const SUB = {
  TITLE: 'Byt övning',
  INTRO: 'Utförda set påverkas inte. Ett byte garanterar inte att övningen passar vid besvär.',
  SHOW_MORE: 'Visa fler',
  SHOW_LESS: 'Visa färre',
  KEEP: (name: string) => `Behåll ${name}`,
  OTHER_MACHINE: 'Annan maskin?',
  MACHINE_LABEL: 'Vilken maskin? (t.ex. gymmets namn)',
  MACHINE_HELP: 'Olika maskiner har olika utväxling. Ny maskin får egen historik – inga kilo förs över.',
  STANDARD_MACHINE: 'Standard',
  FAMILIARITY_Q: 'Har du gjort övningen tidigare?',
  FAMILIARITY_YES: 'Ja',
  FAMILIARITY_NO: 'Nej',
  FAMILIARITY_HELP: 'Svaret sparas för övningen och avgör om ett första, osäkert viktförslag kan visas.',
  PRIOR_NOTE: 'Uppskattning – bekräfta vikten med ett kontrollerat första set',
  PRIOR_DETAIL: (from: string, pct: number) => `Bygger på en genomsnittlig skillnad mot ${from} i en liten studie, inte på dig, och använder högst ${Math.round(pct * 100)} % av den preliminära maxstyrkan. Ändra gärna.`,
  NO_WEIGHT: 'Ingen tillförlitlig vikt ännu',
  NO_WEIGHT_HELP: 'Välj en lätt vikt för ett kontrollerat första set. Fältet kan lämnas tomt – du anger då vikten vid setet.',
  CAL_INSTRUCTIONS: 'Kontrollerat första set: välj en vikt du säkert klarar med god teknik. Testa inte maximal vikt. Avbryt om besvären ökar.',
  START_WEIGHT: 'Startvikt (kg)',
  START_WEIGHT_PER_HAND: 'Startvikt (kg per hantel)',
  START_ASSIST: 'Assistans (kg) – lägre = tyngre',
  SCOPE_LEGEND: 'Gäller',
  SCOPE_TODAY: 'Bara idag',
  SCOPE_FUTURE: 'Använd framöver',
  SCOPE_FUTURE_HELP: 'Påverkar bara kommande planering. Tidigare pass ändras inte.',
  GOAL_NOTE: (root: string) => `Ditt mål för ${root} ligger kvar. Byter du under längre tid tränar du ${root.toLowerCase()} mindre direkt.`,
  /** Seed-filens klassdefinitioner, kopplade till det planerade lyftet. */
  TRANSFER: {
    movement_family: (root: string) => `Delvis överlapp – ingen direkt överföring till styrkan i ${root.toLowerCase()}.`,
    accessory: (root: string) => `Inte likvärdig för ditt styrkemål i ${root.toLowerCase()}.`,
  } as Record<'movement_family' | 'accessory', (root: string) => string>,
  CANDIDATES_NOTE: 'Alternativen är kandidater, inte bevisat likvärdiga. Varje övning har egen vikt och historik.',
  CONFIRM: (name: string) => `Byt till ${name}`,
  BACK: 'Tillbaka',
  SWAPPED: (from: string, to: string) => `Bytt från ${from.toLowerCase()} till ${to.toLowerCase()}.`,
  SWAPPED_PRIOR: 'Vikten är ett första, osäkert förslag och kalibreras med din prestation.',
  SWAPPED_NONE: 'Ingen tillförlitlig vikt ännu – välj en lätt, kontrollerad vikt.',
  ORIGINAL: 'Ursprunglig övning',
  EFFORT_Q: 'Hur kändes setet?',
  EFFORT: { easy: 'Lätt', ok: 'Lagom', too_heavy: 'För tungt' },
  PER_HAND: 'Vikt anges per hantel.',
  PER_SIDE: 'Repetitioner anges per sida.',
  FAILED: 'Bytet kunde inte göras.',
} as const;

/** Viktstatus för ett bytesalternativ (CR §2.1 p.3: "om nytt viktförslag finns"). */
export function loadStatusText(kind: string | undefined, needsFamiliarity: boolean): string {
  switch (kind) {
    case 'target_observed':
      return 'Viktförslag från din historik';
    case 'target_estimated':
      return 'Viktförslag från din uppskattning';
    case 'calibration':
      return 'Viktförslag från din kalibrering';
    case 'population_prior_low_confidence':
      return 'Osäker uppskattning – du bekräftar vikten';
    default:
      return needsFamiliarity ? 'Uppskattning möjlig om du gjort övningen förut' : 'Ingen tillförlitlig vikt ännu – du väljer';
  }
}

/** Varför ett alternativ inte kan väljas (planReplacement-status). */
export const SUB_BLOCKED_SV: Record<string, string> = {
  NOT_IN_CATALOG: 'Inte ett godkänt alternativ',
  EQUIPMENT_UNAVAILABLE: 'Utrustning saknas',
  USER_BLOCK_EXERCISE: 'Blockerad av din regel',
  SYMPTOM_REVIEW_REQUIRED: 'Belastar ett område med rapporterade besvär',
  PAIR_RULE: 'Bryter din kombinationsregel',
  ALREADY_IN_SESSION: 'Finns redan i passet',
};

export function reasonText(code: string): { text: string; ev: Ev } | null {
  if (code.startsWith('TEMPLATE_')) return { text: `Ingår i ${TEMPLATE_SV[code.slice(9)] ?? 'programmallen'}.`, ev: 'H' };
  if (code.startsWith('TIME_LIMIT_')) return { text: `Anpassat till ${code.slice(11)} minuter.`, ev: 'U' };
  return REASONS[code] ?? null;
}

export const EV_SV: Record<Ev, string> = {
  E1: 'Stöd i forskningsöversikter (gruppnivå)',
  E2: 'Indirekt stöd',
  H: 'Produktheuristik – inte vetenskapligt validerad',
  U: 'Ditt eget val',
};

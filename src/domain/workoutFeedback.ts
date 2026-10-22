export const WORKOUT_FEEDBACK = {
  progress: [
    "Ett jämförbart set hade högre belastning och minst lika många repetitioner.",
    "Dagens registrering visar en konkret förbättring mot senaste jämförbara passet.",
    "Ett steg upp i belastning finns nu i träningsdagboken.",
    'Du lyfte mer med minst lika många repetitioner. Ett tydligt steg framåt.',
    'Dagens jämförbara set visar framsteg. Bra arbete.',
    'Mer belastning, bibehållna repetitioner. Din träning går framåt.',
  ],
  complete: [
    "Planens sista set är registrerat. Det får räcka som kvitto.",
    "Du har slutfört dagens planerade arbete.",
    "Passet är genomfört och resultatet finns med i nästa beräkning.",
    'Dagens plan är genomförd. Bra jobbat.',
    'Alla dagens set är klara. Nu får träningen landa.',
    'Du genomförde det du planerade för idag. Fint arbete.',
  ],
  adjusted: [
    "Du använde en lägre belastning än planerat. Det är registrerat.",
    "Planen fick möta verkligheten. Dina faktiska set är underlaget framåt.",
    "Dagens lägre vikt finns sparad tillsammans med repetitionerna.",
    'Du anpassade belastningen efter dagen. Det är en del av hållbar träning.',
    'Bra att du gav dagens förutsättningar utrymme.',
    'Dagens anpassning hör också till träningen. Dina set är sparade.',
  ],
  demanding: [
    "Flera set kändes tunga enligt dina svar. Det finns med i underlaget.",
    "Du har registrerat hög ansträngning. Nästa förslag använder den informationen.",
    "De tunga seten är sparade, inklusive hur de kändes.",
    'Det blev ett krävande pass. Ge dig utrymme för återhämtning.',
    'Du beskrev flera tunga set idag. Nu är passet klart.',
    'Ett ansträngande pass är bakom dig. Ta hand om återhämtningen.',
  ],
  substituted: [
    "Bytet är dokumenterat tillsammans med det du genomförde.",
    "Dina nya övningar har fått egna resultat i historiken.",
    "Ändrat övningsval, sparat arbete.",
    'Du hittade en annan väg genom passet. Bra anpassat.',
    'Övningarna ändrades, träningen blev av.',
    'Du gjorde passet till ditt. Dina genomförda set är sparade.',
  ],
  partial: [
    "Dagens registrerade arbete finns kvar även när passet blev kortare.",
    "Du avslutade innan allt var klart. Beräkningen använder det du faktiskt gjorde.",
    "Det blev en del av planen idag. Den delen är sparad.",
    'Det du hann göra räknas också. Dina set är sparade.',
    'Du fick in träning idag, även om allt inte blev gjort.',
    'Ett kortare pass är också träning. Fortsätt när det passar.',
  ],
  returning: [
    "Första passet efter uppehållet är registrerat.",
    "En ny rad efter uppehållet. Fortsätt i en takt som passar.",
    "Du är tillbaka i träningsdagboken. Dagens arbete är sparat.",
    'Välkommen tillbaka. Ett pass i taget.',
    'Du är igång igen. Låt fortsättningen ta den tid den behöver.',
    'Dagens pass blev en ny start. Bra att vara tillbaka.',
  ],
  general: [
    "Resultatet är sparat och kan användas nästa gång.",
    "Träningsdagboken har fått mer att gå på.",
    "Dagens registrerade arbete är nu en del av underlaget.",
    'Dagens träning är sparad. Bra jobbat.',
    'Ett pass till i din träningsdagbok.',
    'Du tog dig tid för träningen idag. Fint gjort.',
  ],
  extra: ['Du lade till träning och genomförde den. Arbetsseten ingår i underlaget.', 'Det blev extra arbete idag. Det är sparat som genomförd träning.', 'Dina extra set har också en plats i träningsdagboken.', 'Passet växte. Beräkningen följer det du faktiskt gjorde.'],
  first: ['En ny övning har fått sina första registrerade arbetsset.', 'Första resultatet i en ny övning är sparat. Nästa förslag har mer underlag.', 'Nu finns egna data för en övning du inte registrerat tidigare.', 'Ett första mätvärde är bättre underlag än ett allmänt startförslag.'],
  maintained: ['Ett jämförbart set matchade föregående prestation.', 'Samma belastning och repetitioner finns registrerade igen.', 'Dagens jämförbara resultat ligger kvar på samma nivå.', 'Du upprepade en tidigare registrerad prestation. Det ger mer underlag.'],
  empty: ['Passet är avslutat. Du kan börja igen när det passar.'],
} as const;
export type FeedbackCategory = keyof typeof WORKOUT_FEEDBACK;
export type FeedbackFacts = {
  extra?: boolean;
  first?: boolean;
  maintained?: boolean;
  performed: number;
  complete: boolean;
  improved: boolean;
  adjusted: boolean;
  demanding: boolean;
  substituted: boolean;
  returning: boolean;
  partial: boolean;
};
export function feedbackCategory(f: FeedbackFacts): FeedbackCategory {
  if (!f.performed) return 'empty';
  if (f.returning) return 'returning';
  if (f.improved) return 'progress';
  if (f.adjusted) return 'adjusted';
  if (f.partial) return 'partial';
  if (f.demanding) return 'demanding';
  if (f.extra) return 'extra';
  if (f.first) return 'first';
  if (f.maintained) return 'maintained';
  if (f.substituted) return 'substituted';
  return f.complete ? 'complete' : 'general';
}
/** Randomness is supplied by the caller; selection remains testable and repeatable. */
export function chooseFeedback(category: FeedbackCategory, recent: string[], seed: number): string {
  const choices = WORKOUT_FEEDBACK[category];
  const fresh = choices.filter((text) => !recent.includes(text));
  const pool = fresh.length ? fresh : choices;
  return pool[Math.abs(Math.trunc(seed)) % pool.length];
}

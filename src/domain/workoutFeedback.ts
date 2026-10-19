export const WORKOUT_FEEDBACK = {
  progress: [
    'Du lyfte mer med minst lika många repetitioner. Ett tydligt steg framåt.',
    'Dagens jämförbara set visar framsteg. Bra arbete.',
    'Mer belastning, bibehållna repetitioner. Din träning går framåt.',
  ],
  complete: [
    'Dagens plan är genomförd. Bra jobbat.',
    'Alla dagens set är klara. Nu får träningen landa.',
    'Du genomförde det du planerade för idag. Fint arbete.',
  ],
  adjusted: [
    'Du anpassade belastningen efter dagen. Det är en del av hållbar träning.',
    'Bra att du gav dagens förutsättningar utrymme.',
    'Dagens anpassning hör också till träningen. Dina set är sparade.',
  ],
  demanding: [
    'Det blev ett krävande pass. Ge dig utrymme för återhämtning.',
    'Du beskrev flera tunga set idag. Nu är passet klart.',
    'Ett ansträngande pass är bakom dig. Ta hand om återhämtningen.',
  ],
  substituted: [
    'Du hittade en annan väg genom passet. Bra anpassat.',
    'Övningarna ändrades, träningen blev av.',
    'Du gjorde passet till ditt. Dina genomförda set är sparade.',
  ],
  partial: [
    'Det du hann göra räknas också. Dina set är sparade.',
    'Du fick in träning idag, även om allt inte blev gjort.',
    'Ett kortare pass är också träning. Fortsätt när det passar.',
  ],
  returning: [
    'Välkommen tillbaka. Ett pass i taget.',
    'Du är igång igen. Låt fortsättningen ta den tid den behöver.',
    'Dagens pass blev en ny start. Bra att vara tillbaka.',
  ],
  general: [
    'Dagens träning är sparad. Bra jobbat.',
    'Ett pass till i din träningsdagbok.',
    'Du tog dig tid för träningen idag. Fint gjort.',
  ],
  empty: ['Passet är avslutat. Du kan börja igen när det passar.'],
} as const;
export type FeedbackCategory = keyof typeof WORKOUT_FEEDBACK;
export type FeedbackFacts = {
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

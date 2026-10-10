/**
 * Fångar inloggningsparametrar i URL:en vid sidstart, innan Supabase-klienten skapas och rensar dem.
 * Används för att förklara misslyckade e-postlänkar (t.ex. öppnad i annan webbläsare – PKCE-verifieraren saknas).
 */
export type AuthCallbackInfo = { hadCode: boolean; recovery: boolean; error: string | null; errorCode: string | null };

function capture(): AuthCallbackInfo {
  if (typeof window === 'undefined') return { hadCode: false, recovery: false, error: null, errorCode: null };
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const get = (k: string) => q.get(k) ?? h.get(k);
  return { hadCode: !!q.get('code'), recovery: q.get('recovery') === '1', error: get('error_description') ?? get('error'), errorCode: get('error_code') };
}

export const initialAuthCallback: AuthCallbackInfo = capture();

export function callbackMessage(info: AuthCallbackInfo): string | null {
  if (info.errorCode === 'otp_expired' || /expired|invalid/i.test(info.error ?? '')) return 'Inloggningslänken har gått ut eller redan använts. Skicka en ny och använd gärna koden i mejlet.';
  if (info.error) return 'Inloggningen via länken misslyckades. Skicka en ny och skriv in koden från mejlet.';
  if (info.hadCode && info.recovery) return 'Återställningslänken öppnades i en annan webbläsare än den där du begärde den. Välj ”Glömt lösenordet?” igen och skriv in koden från mejlet i stället.';
  if (info.hadCode) return 'Länken öppnades i en annan webbläsare än den där du begärde den, så inloggningen kunde inte slutföras här. Skicka en ny och skriv in koden från mejlet i stället – det fungerar oavsett var du läser mejlet.';
  return null;
}

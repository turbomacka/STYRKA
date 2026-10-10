/** Supabase Auth-fel → begripliga svenska meddelanden. Visar aldrig rå felsträng för användaren. */
export type AuthContext = 'login' | 'signup' | 'confirm' | 'forgot' | 'reset' | 'code' | 'new-password';

type AuthErr = { code?: string; status?: number; message?: string; reasons?: string[] } | null | undefined;

export const MIN_PASSWORD_LENGTH = 8;

export function isOfflineError(err: AuthErr): boolean {
  return !!err && (err.status === 0 || /fetch|network|Failed to fetch|Load failed/i.test(err.message ?? ''));
}

export function authErrorMessage(err: AuthErr, ctx: AuthContext): string {
  if (!err) return 'Något gick fel. Försök igen.';
  if (isOfflineError(err) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'Ingen internetanslutning. Inloggning kräver uppkoppling.';
  const code = err.code ?? '';
  switch (code) {
    case 'invalid_credentials':
      return 'Fel e-post eller lösenord. Har du hittills loggat in via e-post utan lösenord saknar kontot lösenord – välj ”Glömt lösenordet?” för att skapa ett.';
    case 'email_not_confirmed':
      return 'E-postadressen är inte bekräftad ännu. Klicka på länken i bekräftelsemejlet först.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Det finns redan ett konto med den här e-postadressen. Logga in, eller välj ”Glömt lösenordet?”.';
    case 'weak_password':
      return `Lösenordet är för svagt. Använd minst ${MIN_PASSWORD_LENGTH} tecken.`;
    case 'same_password':
      return 'Det nya lösenordet måste skilja sig från det gamla.';
    case 'otp_expired':
      return 'Koden stämmer inte eller har gått ut. Kontrollera siffrorna eller skicka en ny kod.';
    case 'over_email_send_rate_limit':
      return 'För många mejl har skickats just nu. Vänta en stund och försök igen.';
    case 'over_request_rate_limit':
      return 'För många försök just nu. Vänta en stund och försök igen.';
    case 'email_address_invalid':
      return 'E-postadressen ser inte giltig ut.';
    case 'email_address_not_authorized':
      return 'Testmiljön kan ännu inte skicka mejl till den här adressen. Kontakta den som driver testet.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'Det går inte att skapa nya konton just nu.';
    case 'otp_disabled':
      return 'Det finns inget konto för e-postadressen. Skapa ett konto först.';
    case 'reauthentication_needed':
    case 'reauthentication_not_valid':
      return 'Av säkerhetsskäl behöver du logga in på nytt innan du byter lösenord. Du kan också använda ”Glömt lösenordet?”.';
    case 'session_not_found':
    case 'session_expired':
      return 'Din inloggning har gått ut. Logga in igen.';
    case 'validation_failed':
      return ctx === 'login' || ctx === 'signup' ? 'Kontrollera e-postadressen och lösenordet.' : 'Kontrollera uppgifterna.';
  }
  if (err.status === 429) return 'För många försök just nu. Vänta en stund och försök igen.';
  if (/token has expired|invalid/i.test(err.message ?? '') && (ctx === 'confirm' || ctx === 'reset' || ctx === 'code')) return 'Koden stämmer inte eller har gått ut. Kontrollera siffrorna eller skicka en ny kod.';
  if (/password/i.test(err.message ?? '') && /least|short|weak/i.test(err.message ?? '')) return `Lösenordet är för svagt. Använd minst ${MIN_PASSWORD_LENGTH} tecken.`;
  return 'Något gick fel. Försök igen om en stund.';
}

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Ange en giltig e-postadress.';
}

export function validateNewPassword(pw: string, repeat: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Lösenordet måste ha minst ${MIN_PASSWORD_LENGTH} tecken.`;
  if (pw !== repeat) return 'Lösenorden matchar inte.';
  return null;
}

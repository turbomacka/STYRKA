import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common';
import { PRIVACY_NOTICE_VERSION } from '../../application/profile';

/** Integritetsinformation – UTKAST. Kräver juridisk granskning (G5, RD01–RD05) före extern pilot. */
export function Privacy() {
  const nav = useNavigate();
  return (
    <main className="shell">
      <div className="page stack">
        <PageHeader title="Integritet" back={() => nav(-1)} />
        <p className="chip warn">Utkast {PRIVACY_NOTICE_VERSION} – ej juridiskt granskat</p>
        <div className="card stack">
          <h2>Vad STYRKA är</h2>
          <p>STYRKA ger träningsförslag för styrka baserat på din registrerade träning och dina valda inställningar. Appen ställer inga diagnoser, behandlar inte sjukdom och ersätter inte vård.</p>
          <h2>Vilka uppgifter sparas</h2>
          <ul>
            <li>E-postadress för inloggning.</li>
            <li>Träningsinställningar, uppskattad styrka, pass, set och de förslag appen gav.</li>
            <li>Frivilligt och bara med ditt separata samtycke: problemområden och besvär efter pass.</li>
          </ul>
          <p>Ålder och kön behövs inte och påverkar inte förslagen.</p>
          <h2>Var och hur</h2>
          <p>Uppgifterna sparas på din enhet och synkas till en databas där bara ditt konto kan läsa dem. Ingen data delas, säljs eller används för att träna AI-modeller. Tekniska loggar innehåller inga hälso- eller styrkeuppgifter.</p>
          <h2>Dina rättigheter</h2>
          <p>Du kan exportera all din data, radera hälsorelaterade uppgifter separat och radera hela kontot under Profil → Data och konto.</p>
          <h2>Öppna frågor före lansering</h2>
          <p className="small muted">Personuppgiftsansvarig, rättslig grund (art. 6 och art. 9 GDPR), lagringsplats, biträdesavtal, lagringstider, backup och eventuell konsekvensbedömning ska fastställas och granskas av jurist innan appen används av andra än testanvändare.</p>
        </div>
      </div>
    </main>
  );
}

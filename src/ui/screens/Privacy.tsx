import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common';

/** Integritetsinformation – UTKAST. Kräver juridisk granskning (G5, RD01–RD05) före extern pilot. */
export function Privacy() {
  const nav = useNavigate();
  return (
    <main className="shell">
      <div className="page stack">
        <PageHeader title="Integritet" back={() => nav(-1)} />
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
          <h2>Om den här informationen</h2>
          <p className="small muted">Integritetsinformationen är ännu inte fullständig. Uppgifter om vem som ansvarar för dina personuppgifter och hur länge de sparas saknas fortfarande.</p>
        </div>
      </div>
    </main>
  );
}

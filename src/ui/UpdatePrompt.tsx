import { useRegisterSW } from 'virtual:pwa-register/react';

/** PWA-uppdatering sker först efter användarens val – aldrig mitt i ett pass. IndexedDB bevaras. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span>Ny version finns.</span>
      <button type="button" className="btn" onClick={() => updateServiceWorker(true)}>
        Uppdatera
      </button>
      <button type="button" className="btn" onClick={() => setNeedRefresh(false)}>
        Senare
      </button>
    </div>
  );
}

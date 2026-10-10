import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
// Måste läsas före Supabase-klienten skapas (den rensar URL:en).
import './ui/authCallback';
import { App } from './ui/App';

// Be webbläsaren om beständig lagring (ingen garanti, särskilt inte på iOS – servern är backup, R11).
void navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

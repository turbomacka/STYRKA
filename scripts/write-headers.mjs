// Skriver dist/_headers (Cloudflare Pages) med säkerhetsheaders. connect-src begränsas till byggets Supabase-URL.
import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'staging';
const env = Object.fromEntries(
  readFileSync(`.env.${mode}`, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const supa = env.VITE_SUPABASE_URL;
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supa ?? '')) throw new Error(`Ogiltig VITE_SUPABASE_URL i .env.${mode}`);
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${supa}`,
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  X-Frame-Options: DENY
  X-Robots-Tag: noindex, nofollow

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
writeFileSync('dist/_headers', headers);
console.log(`dist/_headers skriven (${mode}, connect-src ${supa})`);

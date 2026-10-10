/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'STYRKA',
        short_name: 'STYRKA',
        description: 'Träningsförslag för styrka baserat på din registrerade träning och valda inställningar.',
        lang: 'sv',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f5f7',
        theme_color: '#0b5cad',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Endast statiska resurser cachas (03 §1). Inga API-svar eller hälsodata i webbcache (03 §4).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
    }),
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.{ts,tsx}'], environment: 'node', setupFiles: ['fake-indexeddb/auto'] },
      },
      {
        extends: true,
        test: { name: 'ui', include: ['tests/ui/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['tests/ui/setup.ts'] },
      },
      {
        extends: true,
        test: { name: 'db', include: ['tests/db/**/*.test.ts'], environment: 'node', testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
      },
    ],
  },
});

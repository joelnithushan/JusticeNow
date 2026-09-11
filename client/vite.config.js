import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// JusticeNow is deliberately a PWA rather than a native app: a native app
// leaves an install record and a visible entry in the device app list,
// which is a risk for someone whose phone may be checked. A PWA can still
// be added to the home screen but leaves far less behind.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'JusticeNow',
        short_name: 'JusticeNow',
        description: 'Anonymous human rights case reporting and tracking',
        display: 'standalone',
        background_color: '#f7f6f3',
        theme_color: '#3d4a5c',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
});

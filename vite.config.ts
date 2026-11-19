import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { devApi } from './server/devApi.js';

const pwa = () =>
  VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
    manifest: {
      name: 'Route Planner',
      short_name: 'Route Planner',
      description: 'Plan rental truck routes through depots for each job.',
      theme_color: '#1f6b45',
      background_color: '#f3f4f1',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // API calls need the network and must never come from a stale cache.
      navigateFallbackDenylist: [/^\/api\//],
    },
  });

export default defineConfig(({ mode }) => {
  // The APK ships its files inside the app, so it needs no service worker or /api.
  const isApk = mode === 'apk';
  return {
    plugins: [react(), devApi(loadEnv(mode, process.cwd(), '')), ...(isApk ? [] : [pwa()])],
    build: { outDir: isApk ? 'dist-apk' : 'dist' },
    server: {
      // Lets a temporary Cloudflare tunnel reach the dev server for remote testing.
      allowedHosts: ['.trycloudflare.com'],
    },
    test: {
      include: ['tests/**/*.test.ts'],
    },
  };
});

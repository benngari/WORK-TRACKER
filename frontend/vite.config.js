import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Work Tracker',
        short_name: 'Work Tracker',
        description: 'Personal Work, Job, Attendance & Payment Tracking System',
        theme_color: '#18885d',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        shortcuts: [
          {
            name: 'Record Attendance',
            short_name: 'Attendance',
            description: 'Record a day worked',
            url: '/attendance?new=1',
            icons: [{ src: 'https://res.cloudinary.com/dd4b2ssdy/image/upload/w_192,h_192,c_fill,f_png/v1787773487/men_on_carrmels_wo6vmf.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Add Expense',
            short_name: 'Expense',
            description: 'Add an expense',
            url: '/expenses?new=1',
            icons: [{ src: 'https://res.cloudinary.com/dd4b2ssdy/image/upload/w_192,h_192,c_fill,f_png/v1787773487/men_on_carrmels_wo6vmf.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Paste M-PESA',
            short_name: 'M-PESA',
            description: 'Paste an M-PESA message',
            url: '/mpesa?new=1',
            icons: [{ src: 'https://res.cloudinary.com/dd4b2ssdy/image/upload/w_192,h_192,c_fill,f_png/v1787773487/men_on_carrmels_wo6vmf.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          {
            src: 'https://res.cloudinary.com/dd4b2ssdy/image/upload/w_192,h_192,c_fill,f_png/v1787773487/men_on_carrmels_wo6vmf.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'https://res.cloudinary.com/dd4b2ssdy/image/upload/w_512,h_512,c_fill,f_png/v1787773487/men_on_carrmels_wo6vmf.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        // big PDF/export libraries are only needed when you export, so don't download them up front
        globIgnores: ['**/jspdf*', '**/html2canvas*', '**/purify*', '**/index.es*'],
        // When the server is slow or offline, show the last data you saw instead of waiting.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/(jspdf|html2canvas|purify|index\.es)/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'heavy-libs', expiration: { maxEntries: 10 } },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.pathname.startsWith('/api/') &&
              !/^\/api\/(auth|audit|backup)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split big libraries into their own files so they download in parallel and cache well.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/recharts|d3-|victory/.test(id)) return 'charts';
          if (/react-router|react-dom|[\\/]react[\\/]|scheduler/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
});
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
});
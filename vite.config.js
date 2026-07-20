import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'MedNet',
        short_name: 'MedNet',
        description: 'Plataforma operacional de monitoramento de motoristas',
        theme_color: '#F26931',
        background_color: '#1a1a1a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Dados do Supabase são autenticados e podem conter informações
      // sensíveis. O service worker limita-se ao precache dos assets da app.
      workbox: {
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
        // Evita alguns problemas de hoisting/scoping em minificação agressiva
        hoist_funs: true,
        hoist_vars: false,
        inline: false,
      },
      mangle: {
        // Evita renomear variáveis para nomes que podem causar conflitos lexicais em closures complexas
        safari10: true,
      }
    },
  }
})

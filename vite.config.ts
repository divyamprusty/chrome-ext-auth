import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  envPrefix: 'VITE_',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
   rollupOptions: {
      input: {
        main: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background.ts'),
        contentScript: resolve(__dirname, 'src/contentScript.ts')
      },
      output: {
        assetFileNames: 'assets/[name][extname]',
        entryFileNames: chunk => {
          if (chunk.name === 'background') return 'background.js'
          if (chunk.name === 'contentScript') return 'contentScript.js'
          if (chunk.name === 'popup') return 'assets/popup.js'
          return 'assets/[name].js'
        }
      }
    }
  },
  plugins: [react(), tailwindcss()]
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base указывает подкаталог — приложение деплоится на GitHub Pages
// из пути https://<org>.github.io/food-bridge/
export default defineConfig({
  plugins: [react()],
  base: '/food-bridge/',
})

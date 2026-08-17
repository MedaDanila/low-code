import vue from '@vitejs/plugin-vue'
import { defineConfig, type PluginOption } from 'vite'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [vue()]

  if (command === 'serve') {
    const { generatedApiDevServer } = await import('./dev-server/generatedApiDevServer.js')
    plugins.push(generatedApiDevServer())
  }

  return {
    base: process.env.VITE_BASE_PATH ?? '/',
    plugins,
  }
})

import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  // Load every variable from .env/process.env, not only the VITE_ ones,
  // so we can keep using MAPBOX_ACCESS_TOKEN as is
  const env = loadEnv(mode, process.cwd(), "")

  return {
    define: {
      "process.env.MAPBOX_ACCESS_TOKEN": JSON.stringify(env.MAPBOX_ACCESS_TOKEN),
    },
  }
})

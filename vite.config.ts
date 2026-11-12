import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // The SolidStart development error viewer imports this CommonJS package.
  optimizeDeps: { include: ["source-map-js", "error-stack-parser"] },
  server: {
    watch: { ignored: ["**/.data/**", "**/test-results/**", "**/playwright-report/**"] }
  },
  plugins: [
    solidStart({
      ssr: true
    }),
    tailwindcss(),
    nitro()
  ]
});

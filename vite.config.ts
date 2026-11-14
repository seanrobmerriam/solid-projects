import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Keep the realtime SDK's client/server entry points outside the SSR chunk
  // graph; bundling them together creates a CommonJS-helper import cycle.
  ssr: { external: ["@neon/realtime", "pg", "@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "just-bash"] },
  // The SolidStart development error viewer imports this CommonJS package.
  optimizeDeps: { include: ["source-map-js", "error-stack-parser"] },
  server: {
    watch: { ignored: ["**/.data/**", "**/test-results/**", "**/playwright-report/**"] }
  },
  plugins: [
    solidStart({
      middleware: "src/middleware.ts",
      ssr: true
    }),
    tailwindcss(),
    nitro()
  ]
});

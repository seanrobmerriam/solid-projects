import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  preview: {
    realtime: { allowedOrigins: ["http://localhost:3000", "http://localhost:3010", "http://localhost:3011", "https://solid.typesayfe.com"] },
  },
  auth: true,
  functions: {
    summary: { name: "Workspace summary", source: "./functions/summary.ts" },
  },
  buckets: {
    // "private" is the default; use "public_read" for anonymous reads
    documents: { access: "private" },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});

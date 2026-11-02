import { defineConfig } from "vite";

export default defineConfig({
  // Pages supplies its repository path; local development stays at /.
  base: process.env.AALWYN_BASE_PATH ?? "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("katex")) return "math-display";
          if (/codemirror|@lezer|style-mod|w3c-keyname|crelt/.test(id))
            return "editor";
        },
      },
    },
  },
});

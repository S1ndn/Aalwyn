import { defineConfig } from "vite";

export default defineConfig({
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

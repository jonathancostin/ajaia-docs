import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // mammoth is loaded on the first file import. Without this, the dev server
  // discovers it at that moment and reloads the page, which drops the import.
  optimizeDeps: { include: ["mammoth"] },
  server: {
    // Lets the dev server answer on a Tailscale hostname during review.
    allowedHosts: [".ts.net"],
  },
});

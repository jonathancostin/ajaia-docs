import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    // Lets the dev server answer on a Tailscale hostname during review.
    allowedHosts: [".ts.net"],
  },
});

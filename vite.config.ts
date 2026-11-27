import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: el build funciona en cualquier subruta (p. ej. GitHub Pages /<repo>/). El router usa #hash.
  base: "./",
  server: { port: 5173, host: true },
});

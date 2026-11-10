import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { lookPlugin } from "look/vite";
import { config } from "./src/config.js";

// base "./" so the build also works under file:// (Electron loadFile).
// lookPlugin: no-flash look script in <head> (from config.appId), one React for the linked `look` package.
export default defineConfig({
  plugins: [react(), lookPlugin({ appId: config.appId })],
  base: "./",
  server: { host: "127.0.0.1" },
});

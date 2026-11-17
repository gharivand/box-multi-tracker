import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Deliberately plain: no resolve aliases and no workspace shortcuts, so
// `box-multi-tracker` always resolves to the installed package in node_modules.
export default defineConfig({
  plugins: [react()],
});

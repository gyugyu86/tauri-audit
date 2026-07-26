import { defineConfig } from 'vite';
const prefixes = process.env.WIDE ? ['VITE_', 'TAURI_'] : ['VITE_'];
export default defineConfig({
  envPrefix: prefixes,
});

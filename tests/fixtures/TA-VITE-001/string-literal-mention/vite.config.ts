import { defineConfig } from 'vite';
const note = "do not set envPrefix: 'TAURI_' here";
export default defineConfig({
  envPrefix: ['VITE_'],
  define: { __NOTE__: JSON.stringify(note) },
});

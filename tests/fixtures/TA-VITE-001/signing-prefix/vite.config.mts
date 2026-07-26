import { defineConfig } from 'vite';
export default defineConfig({
  envPrefix: ['VITE_', 'TAURI_SIGNING_'],
});

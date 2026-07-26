import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
});

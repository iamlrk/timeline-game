import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { renameSync, existsSync } from 'fs';

/** In singleplayer mode, rename dist/index-sp.html → dist/index.html after build. */
function renameSpHtmlPlugin(): Plugin {
  return {
    name: 'rename-sp-html',
    closeBundle() {
      const src = resolve(__dirname, 'dist/index-sp.html');
      const dst = resolve(__dirname, 'dist/index.html');
      if (existsSync(src)) renameSync(src, dst);
    },
  };
}

export default defineConfig(({ mode }) => {
  const isSP = mode === 'singleplayer';
  return {
    plugins: isSP ? [renameSpHtmlPlugin()] : [],
    build: {
      rollupOptions: {
        input: isSP
          ? resolve(__dirname, 'index-sp.html')
          : resolve(__dirname, 'index.html'),
      },
    },
    server: {
      port: 3000,
      open: true,
      proxy: isSP ? {} : {
        '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
        '/api':       { target: 'http://localhost:3001', changeOrigin: true },
      },
    },
  };
});

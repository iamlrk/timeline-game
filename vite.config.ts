import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

/** In singleplayer mode, rename index-sp.html → index.html in the output. */
function renameSpHtmlPlugin(): Plugin {
  return {
    name: 'rename-sp-html',
    generateBundle(_, bundle) {
      const chunk = bundle['index-sp.html'] as any;
      if (chunk) {
        chunk.fileName = 'index.html';
        bundle['index.html'] = chunk;
        delete bundle['index-sp.html'];
      }
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

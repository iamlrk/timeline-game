import { defineConfig, type Plugin } from 'vite';

/** In singleplayer mode, swap the script entry in index.html at serve/build time. */
function swapEntryPlugin(mode: string): Plugin {
  return {
    name: 'swap-entry',
    transformIndexHtml(html) {
      if (mode === 'singleplayer') {
        return html.replace('/src/main.ts', '/src/main-sp.ts');
      }
      return html;
    },
  };
}

export default defineConfig(({ mode }) => {
  const isSP = mode === 'singleplayer';
  return {
    plugins: [swapEntryPlugin(mode)],
    server: {
      port: 3000,
      open: true,
      // Proxy only needed in multiplayer mode (socket server runs separately)
      proxy: isSP ? {} : {
        '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
        '/api':       { target: 'http://localhost:3001', changeOrigin: true },
      },
    },
  };
});

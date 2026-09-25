import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(here, '..');

/**
 * QR サイドロードで実機から読むときは dev サーバーを LAN に出し、HMR の戻り先も
 * LAN IP にする（Tokyojihatsu と同じ）。ポートは Tokyojihatsu（5173/5175/5176）と
 * 被らない 5177。
 */
const lanIp = process.env.LAN_IP;

export default defineConfig({
  root: here,
  envDir: projectRoot,
  build: {
    outDir: resolve(projectRoot, 'dist/app'),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5177,
    // ポートが埋まっていたら黙ってずらさない。QR が別のサーバーを指す事故を防ぐ。
    strictPort: true,
    host: true,
    hmr: lanIp ? { host: lanIp } : undefined,
  },
});

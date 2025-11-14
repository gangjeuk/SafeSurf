import { resolve } from 'node:path';
import { withPageConfig } from '@extension/vite-config';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');
const packageDir = resolve(rootDir, '../../packages')

export default withPageConfig({
  resolve: {
    alias: {
      '@src': srcDir,
      '@packages' : packageDir,
    },
  },
  publicDir: resolve(rootDir, 'public'),
  build: {
    outDir: resolve(rootDir, '..', '..', 'dist', 'options'),
  },
});

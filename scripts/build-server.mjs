import { build } from 'esbuild';
await build({
  entryPoints: ['server/index.ts'],
  outfile: 'server-dist/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
});

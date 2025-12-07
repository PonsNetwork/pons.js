import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false, // Using tsc for declarations instead (tsup dts hangs)
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
  external: ['viem', '@waku/sdk', '@waku/interfaces'],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    };
  },
});


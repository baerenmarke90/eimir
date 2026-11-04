import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import application from '../vite.config.ts';

// Keep fixture pages and browser module probes out of the release build. All
// entries share one bundle graph, so probes use the application's own state.
export default mergeConfig(
  application,
  defineConfig({
    build: {
      outDir: 'e2e/dist',
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          app: resolve(import.meta.dirname, '../index.html'),
          foundations: resolve(
            import.meta.dirname,
            'fixtures/product-reference-foundations.html',
          ),
          'e2e/modules/memoryDiaryDraft': resolve(
            import.meta.dirname,
            '../src/client/memoryDiaryDraft.ts',
          ),
          'e2e/modules/sessionPersistence': resolve(
            import.meta.dirname,
            '../src/client/sessionPersistence.ts',
          ),
          'e2e/modules/selectedMediaRetention': resolve(
            import.meta.dirname,
            '../src/client/selectedMediaRetention.ts',
          ),
        },
        preserveEntrySignatures: 'strict',
        output: {
          entryFileNames: (chunk) =>
            chunk.name.startsWith('e2e/modules/')
              ? '[name].js'
              : 'assets/[name]-[hash].js',
        },
      },
    },
  }),
);

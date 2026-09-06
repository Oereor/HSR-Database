import type { CompilerOptions } from '@inlang/paraglide-js';

export default {
  project: './project.inlang',
  outdir: './src/lib/paraglide',
  strategy: ['url', 'baseLocale'],
  emitTsDeclarations: true
} satisfies CompilerOptions;

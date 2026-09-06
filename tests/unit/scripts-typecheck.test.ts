import ts from 'typescript';
import { expect, it } from 'vitest';

it('the scripts compiler gate accepts the production script graph', () => {
  const configFile = ts.readConfigFile('tsconfig.scripts.json', ts.sys.readFile);
  expect(configFile.error).toBeUndefined();
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
  expect(config.errors).toEqual([]);
  const program = ts.createProgram(config.fileNames, config.options);
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  expect(errors).toEqual([]);
}, 30000);

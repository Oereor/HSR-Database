import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('the scripts compiler gate catches the real missing defined helper without editing source', () => {
  const configFile = ts.readConfigFile('tsconfig.scripts.json', ts.sys.readFile);
  expect(configFile.error).toBeUndefined();
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
  expect(config.errors).toEqual([]);
  const syncPath = path.resolve('scripts/data/sync.ts');
  expect(config.fileNames).toContain(syncPath.replaceAll('\\', '/'));
  const host = ts.createCompilerHost(config.options);
  const original = host.getSourceFile.bind(host);
  let removed = false;
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => {
    const source = original(file, languageVersion, onError, shouldCreateNewSourceFile);
    if (source && path.resolve(file) === syncPath) {
      const helper = source.statements.find(
        (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'defined'
      );
      if (!helper) throw new Error('Expected the production defined helper');
      removed = true;
      return ts.createSourceFile(
        file,
        source.text.slice(0, helper.getFullStart()) + source.text.slice(helper.end),
        languageVersion,
        true
      );
    }
    return source;
  };
  const program = ts.createProgram(config.fileNames, config.options, host);
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  expect(removed).toBe(true);
  expect(
    errors.some(
      (diagnostic) =>
        diagnostic.file &&
        path.resolve(diagnostic.file.fileName) === syncPath &&
        ts
          .flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          .includes("Cannot find name 'defined'")
    )
  ).toBe(true);
}, 30000);

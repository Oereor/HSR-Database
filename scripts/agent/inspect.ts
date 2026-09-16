import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  formatInspection,
  inspectQuestion,
  parseInspectorArguments,
  redactSecrets,
  saveInspection
} from './inspector.js';

async function main() {
  const args = parseInspectorArguments(process.argv.slice(2));
  const secrets = [process.env.DEEPSEEK_API_KEY ?? ''];
  const run = async (question: string) => {
    const inspection = await inspectQuestion(question, args.thinkingMode);
    console.log(formatInspection(inspection, args.verbose, secrets));
    if (args.save)
      console.log(`Saved: ${await saveInspection(inspection, process.cwd(), secrets)}`);
  };
  if (args.question) {
    await run(args.question);
    return;
  }
  console.log(
    `HSR Data Agent Inspector\nthinking: ${args.thinkingMode}\n每个问题独立运行；输入 :quit 或 EOF 退出。`
  );
  const reader = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  try {
    // Async iteration supports both a terminal and piped questions without shared context.
    reader.setPrompt('> ');
    reader.prompt();
    for await (const line of reader) {
      const question = line.trim();
      if (question === ':quit') break;
      if (question) {
        try {
          await run(question);
        } catch (error) {
          console.error(
            redactSecrets(error instanceof Error ? error.message : 'Agent failed', secrets)
          );
        }
      }
      reader.prompt();
    }
  } finally {
    reader.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    redactSecrets(error instanceof Error ? error.message : 'Inspector failed', [
      process.env.DEEPSEEK_API_KEY ?? ''
    ])
  );
  process.exitCode = 1;
});

import { runDataAgent } from '../../src/lib/server/agent/runtime.js';
import { createDeepSeekClientFromEnv } from '../../src/lib/server/agent/providers/deepseek.js';

function parseArguments(args: string[]) {
  const debug = args.includes('--debug');
  const question = args
    .filter((argument) => argument !== '--debug')
    .join(' ')
    .trim();
  if (!question) throw new Error('Usage: pnpm agent:run -- "问题" [--debug]');
  return { debug, question };
}

async function main() {
  const { debug, question } = parseArguments(process.argv.slice(2));
  const result = await runDataAgent(question, { client: createDeepSeekClientFromEnv() });
  console.log(JSON.stringify(result.answer, null, 2));
  if (debug)
    console.error(
      JSON.stringify(
        {
          turns: result.turns,
          toolCalls: result.toolCalls,
          usage: result.usage,
          invalidEvidenceIds: result.invalidEvidenceIds,
          trace: result.trace
        },
        null,
        2
      )
    );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Agent failed';
  console.error(message === 'DEEPSEEK_API_KEY is missing' ? message : `Agent error: ${message}`);
  process.exitCode = 1;
});

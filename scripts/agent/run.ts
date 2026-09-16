import { DataAgentError, runDataAgent } from '../../src/lib/server/agent/runtime.js';

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
  const result = await runDataAgent(question);
  console.log(JSON.stringify(result.answer, null, 2));
  if (debug)
    console.error(
      JSON.stringify(
        {
          turns: result.turns,
          toolCalls: result.toolCalls,
          usage: result.usage,
          modelTrace: result.modelTrace,
          answerNormalization: result.answerNormalization,
          invalidEvidenceIds: result.invalidEvidenceIds,
          structuredAnswer: result.structuredAnswer,
          hitTurnLimit: result.hitTurnLimit,
          truncationDisclosure: result.truncationDisclosure,
          trace: result.trace
        },
        null,
        2
      )
    );
}

main().catch((error: unknown) => {
  const message = error instanceof DataAgentError ? error.safeMessage : 'Agent 运行失败。';
  console.error(`Agent error: ${message}`);
  process.exitCode = 1;
});

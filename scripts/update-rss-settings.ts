import { runDynamicPhrases } from '../src/core/runner.ts';

runDynamicPhrases().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`phrases:update failed — ${message}`);
  process.exit(1);
});
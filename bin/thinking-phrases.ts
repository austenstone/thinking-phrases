#!/usr/bin/env node --import=tsx
import { runDynamicPhrases } from '../src/core/runner.ts';

runDynamicPhrases().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`thinking-phrases: ${message}`);
  process.exit(1);
});

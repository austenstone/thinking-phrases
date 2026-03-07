import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { applyEdits, modify } from 'jsonc-parser';
import type { Mode } from '../core/types.js';

export function writeVsCodeSettings(settingsPath: string, phrases: string[], mode: Mode): void {
  const initialText = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf8') : '{}\n';
  const edits = modify(
    initialText,
    ['chat.agent.thinking.phrases'],
    { mode, phrases },
    {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
        eol: '\n',
      },
    },
  );

  const updatedText = applyEdits(initialText, edits);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, updatedText.endsWith('\n') ? updatedText : `${updatedText}\n`, 'utf8');
}

export function removeVsCodeThinkingPhrases(settingsPath: string): boolean {
  const initialText = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf8') : '{}\n';
  const edits = modify(initialText, ['chat.agent.thinking.phrases'], undefined, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
      eol: '\n',
    },
  });

  if (edits.length === 0) {
    return false;
  }

  const updatedText = applyEdits(initialText, edits);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, updatedText.endsWith('\n') ? updatedText : `${updatedText}\n`, 'utf8');
  return true;
}

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Tip {
  mac: string;
  windows: string;
  linux: string;
}

type Platform = keyof Tip;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIPS_DIR = join(__dirname, '..', 'tips');
const VSCODE_TIPS_DIR = join(TIPS_DIR, 'vscode');
const OUT_DIR = join(__dirname, '..', 'out');

const PLATFORMS: Platform[] = ['mac', 'windows', 'linux'];

function loadTips(): { category: string; tips: Tip[] }[] {
  const files = readdirSync(VSCODE_TIPS_DIR).filter(f => f.endsWith('.json')).sort();
  return files.map(file => ({
    category: file.replace('.json', ''),
    tips: JSON.parse(readFileSync(join(VSCODE_TIPS_DIR, file), 'utf-8')) as Tip[],
  }));
}

function loadStandalonePacks(): { name: string; phrases: string[] }[] {
  const files = readdirSync(TIPS_DIR)
    .filter(file => file.endsWith('.json'))
    .sort();

  return files.map(file => ({
    name: file.replace('.json', ''),
    phrases: JSON.parse(readFileSync(join(TIPS_DIR, file), 'utf-8')) as string[],
  }));
}

function buildSettings(phrases: string[], mode: 'append' | 'replace' = 'append') {
  return {
    'chat.agent.thinking.phrases': { mode, phrases },
  };
}

function main() {
  const categories = loadTips();
  const standalonePacks = loadStandalonePacks();
  const totalTips = categories.reduce((sum, c) => sum + c.tips.length, 0);

  console.log(`Loaded ${totalTips} tips across ${categories.length} categories:`);
  for (const c of categories) {
    console.log(`  ${c.category}: ${c.tips.length} tips`);
  }

  console.log(`Loaded ${standalonePacks.length} standalone pack${standalonePacks.length === 1 ? '' : 's'}:`);
  for (const pack of standalonePacks) {
    console.log(`  ${pack.name}: ${pack.phrases.length} phrases`);
  }

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  for (const platform of PLATFORMS) {
    const phrases = categories.flatMap(c => c.tips.map(tip => tip[platform]));
    const settings = buildSettings(phrases);
    const outPath = join(OUT_DIR, `settings-${platform}.json`);
    writeFileSync(outPath, JSON.stringify(settings, null, 2) + '\n');
    console.log(`\nWrote ${outPath} (${phrases.length} phrases)`);
  }

  const allPhrases = categories.flatMap(category => category.tips.map(tip => tip.mac));
  const vscodeTipsPath = join(OUT_DIR, 'vscode-tips.json');
  writeFileSync(vscodeTipsPath, JSON.stringify(buildSettings(allPhrases), null, 2) + '\n');
  console.log(`\nWrote ${vscodeTipsPath} (${allPhrases.length} tips)`);

  const legacyAllTipsPath = join(OUT_DIR, 'all-tips.json');
  if (existsSync(legacyAllTipsPath)) {
    rmSync(legacyAllTipsPath);
    console.log(`Removed ${legacyAllTipsPath}`);
  }

  for (const pack of standalonePacks) {
    const outPath = join(OUT_DIR, `${pack.name}.json`);
    writeFileSync(outPath, JSON.stringify(buildSettings(pack.phrases), null, 2) + '\n');
    console.log(`Wrote ${outPath} (${pack.phrases.length} tips)`);
  }

  const wowLuaPath = join(OUT_DIR, 'LoadingScreenTips.lua');
  if (existsSync(wowLuaPath)) {
    rmSync(wowLuaPath);
    console.log(`Removed ${wowLuaPath}`);
  }
}

main();

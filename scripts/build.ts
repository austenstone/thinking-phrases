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
const WOW_TIPS_PATH = join(TIPS_DIR, 'wow-loading-screen-tips.json');

const PLATFORMS: Platform[] = ['mac', 'windows', 'linux'];

function loadTips(): { category: string; tips: Tip[] }[] {
  const files = readdirSync(VSCODE_TIPS_DIR).filter(f => f.endsWith('.json')).sort();
  return files.map(file => ({
    category: file.replace('.json', ''),
    tips: JSON.parse(readFileSync(join(VSCODE_TIPS_DIR, file), 'utf-8')) as Tip[],
  }));
}

function buildSettings(phrases: string[], mode: 'append' | 'replace' = 'append') {
  return {
    'chat.agent.thinking.phrases': { mode, phrases },
  };
}

function main() {
  const categories = loadTips();
  const totalTips = categories.reduce((sum, c) => sum + c.tips.length, 0);

  console.log(`Loaded ${totalTips} tips across ${categories.length} categories:`);
  for (const c of categories) {
    console.log(`  ${c.category}: ${c.tips.length} tips`);
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

  const wowTips = JSON.parse(readFileSync(WOW_TIPS_PATH, 'utf-8')) as string[];
  const wowJsonPath = join(OUT_DIR, 'wow-loading-screen-tips.json');
  const wowSettings = buildSettings(wowTips);
  writeFileSync(wowJsonPath, JSON.stringify(wowSettings, null, 2) + '\n');
  console.log(`Wrote ${wowJsonPath} (${wowTips.length} tips)`);

  const wowLuaPath = join(OUT_DIR, 'LoadingScreenTips.lua');
  if (existsSync(wowLuaPath)) {
    rmSync(wowLuaPath);
    console.log(`Removed ${wowLuaPath}`);
  }
}

main();

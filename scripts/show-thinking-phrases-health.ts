import { TASK_HEALTH_PATH, readTaskHealth } from '../src/core/taskHealth.ts';

function formatDuration(durationMs?: number): string {
  if (!Number.isFinite(durationMs)) {
    return 'n/a';
  }

  const normalized = durationMs as number;
  if (normalized < 1_000) {
    return `${normalized}ms`;
  }

  return `${(normalized / 1_000).toFixed(1)}s`;
}

const report = readTaskHealth();

if (!report) {
  console.log(`No task health file found yet at ${TASK_HEALTH_PATH}`);
  process.exit(0);
}

console.log('thinking-phrases health');
console.log(`status: ${report.status}`);
console.log(`phase: ${report.phase}`);
console.log(`message: ${report.lastMessage ?? 'n/a'}`);
console.log(`started: ${report.startedAt}`);
console.log(`updated: ${report.updatedAt}`);
console.log(`completed: ${report.completedAt ?? 'still running'}`);
console.log(`duration: ${formatDuration(report.durationMs)}`);
console.log(`pid: ${report.pid}`);
console.log(`dry run: ${report.dryRun ? 'yes' : 'no'}`);
console.log(`config: ${report.configPath ?? 'default'}`);
console.log(`settings: ${report.settingsPath ?? 'n/a'}`);
console.log(`health file: ${TASK_HEALTH_PATH}`);

if (report.summary) {
  console.log('summary:');
  console.log(`  phrases: ${report.summary.phraseCount}`);
  console.log(`  articles: ${report.summary.articleCount}`);
  console.log(`  stocks: ${report.summary.stockCount}`);
  console.log(`  sources: ${report.summary.sourceCount}`);
}

if (report.sources.length > 0) {
  console.log('sources:');
  for (const source of report.sources) {
    const parts = [`  - ${source.type}: ${source.status}`];
    if (typeof source.itemCount === 'number') {
      parts.push(`${source.itemCount} item${source.itemCount === 1 ? '' : 's'}`);
    }

    if (typeof source.durationMs === 'number') {
      parts.push(formatDuration(source.durationMs));
    }

    if (source.error) {
      parts.push(`error=${source.error}`);
    }

    console.log(parts.join(' • '));
  }
}

if (report.warnings.length > 0) {
  console.log('warnings:');
  for (const warning of report.warnings) {
    console.log(`  - ${warning}`);
  }
}

if (report.error) {
  console.log(`error: ${report.error}`);
}

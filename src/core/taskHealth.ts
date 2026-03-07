import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type TaskHealthStatus = 'running' | 'succeeded' | 'failed';
export type TaskHealthPhase =
  | 'initializing'
  | 'fetching-sources'
  | 'formatting-phrases'
  | 'writing-settings'
  | 'updating-scheduler'
  | 'completed'
  | 'failed';
export type TaskHealthSourceStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface TaskHealthSourceEntry {
  type: string;
  status: TaskHealthSourceStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  itemCount?: number;
  error?: string;
}

export interface TaskHealthSummary {
  sourceCount: number;
  articleCount: number;
  stockCount: number;
  phraseCount: number;
}

export interface TaskHealthReport {
  status: TaskHealthStatus;
  phase: TaskHealthPhase;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  durationMs?: number;
  dryRun: boolean;
  configPath?: string;
  settingsPath?: string;
  pid: number;
  lastMessage?: string;
  error?: string;
  warnings: string[];
  sources: TaskHealthSourceEntry[];
  summary?: TaskHealthSummary;
}

export const TASK_HEALTH_PATH = resolve(process.cwd(), 'launchd', 'task-health.json');

function nowIso(): string {
  return new Date().toISOString();
}

function durationMs(startedAt: string, completedAt: string): number {
  return Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
}

function writeTaskHealth(report: TaskHealthReport): void {
  mkdirSync(dirname(TASK_HEALTH_PATH), { recursive: true });
  const tempPath = `${TASK_HEALTH_PATH}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  renameSync(tempPath, TASK_HEALTH_PATH);
}

export function readTaskHealth(): TaskHealthReport | null {
  try {
    return JSON.parse(readFileSync(TASK_HEALTH_PATH, 'utf8')) as TaskHealthReport;
  } catch {
    return null;
  }
}

export class TaskHealthTracker {
  private report: TaskHealthReport;

  constructor(input: { dryRun: boolean; configPath?: string; settingsPath?: string }) {
    const startedAt = nowIso();
    this.report = {
      status: 'running',
      phase: 'initializing',
      startedAt,
      updatedAt: startedAt,
      dryRun: input.dryRun,
      configPath: input.configPath,
      settingsPath: input.settingsPath,
      pid: process.pid,
      warnings: [],
      sources: [],
      lastMessage: 'Booting thinking-phrases run',
    };
    this.persist();
  }

  get filePath(): string {
    return TASK_HEALTH_PATH;
  }

  setSources(sourceTypes: string[]): void {
    this.report.sources = sourceTypes.map(type => ({ type, status: 'pending' as const }));
    this.touch('initializing', `Prepared ${sourceTypes.length} source${sourceTypes.length === 1 ? '' : 's'} for execution`);
  }

  setPhase(phase: TaskHealthPhase, message: string): void {
    this.touch(phase, message);
  }

  setDryRun(dryRun: boolean): void {
    this.report.dryRun = dryRun;
    this.report.updatedAt = nowIso();
    this.persist();
  }

  startSource(sourceType: string): void {
    const startedAt = nowIso();
    this.updateSource(sourceType, {
      status: 'running',
      startedAt,
      completedAt: undefined,
      durationMs: undefined,
      itemCount: undefined,
      error: undefined,
    });
    this.touch('fetching-sources', `Fetching ${sourceType}`);
  }

  completeSource(sourceType: string, itemCount: number): void {
    const completedAt = nowIso();
    const source = this.findOrCreateSource(sourceType);
    this.updateSource(sourceType, {
      status: 'succeeded',
      completedAt,
      durationMs: source.startedAt ? durationMs(source.startedAt, completedAt) : undefined,
      itemCount,
    });
    this.touch('fetching-sources', `Fetched ${itemCount} item${itemCount === 1 ? '' : 's'} from ${sourceType}`);
  }

  failSource(sourceType: string, error: string): void {
    const completedAt = nowIso();
    const source = this.findOrCreateSource(sourceType);
    this.updateSource(sourceType, {
      status: 'failed',
      completedAt,
      durationMs: source.startedAt ? durationMs(source.startedAt, completedAt) : undefined,
      error,
    });
    this.touch('fetching-sources', `${sourceType} failed`);
  }

  addWarning(warning: string): void {
    if (!this.report.warnings.includes(warning)) {
      this.report.warnings.push(warning);
    }

    this.report.updatedAt = nowIso();
    this.persist();
  }

  succeed(summary: TaskHealthSummary, message: string): void {
    const completedAt = nowIso();
    this.report.status = 'succeeded';
    this.report.phase = 'completed';
    this.report.summary = summary;
    this.report.lastMessage = message;
    this.report.completedAt = completedAt;
    this.report.updatedAt = completedAt;
    this.report.durationMs = durationMs(this.report.startedAt, completedAt);
    this.persist();
  }

  fail(error: string): void {
    const completedAt = nowIso();
    this.report.status = 'failed';
    this.report.phase = 'failed';
    this.report.error = error;
    this.report.lastMessage = error;
    this.report.completedAt = completedAt;
    this.report.updatedAt = completedAt;
    this.report.durationMs = durationMs(this.report.startedAt, completedAt);
    this.persist();
  }

  private touch(phase: TaskHealthPhase, message: string): void {
    this.report.phase = phase;
    this.report.lastMessage = message;
    this.report.updatedAt = nowIso();
    this.persist();
  }

  private findOrCreateSource(sourceType: string): TaskHealthSourceEntry {
    const existing = this.report.sources.find(source => source.type === sourceType);
    if (existing) {
      return existing;
    }

    const source = { type: sourceType, status: 'pending' as const };
    this.report.sources.push(source);
    return source;
  }

  private updateSource(sourceType: string, updates: Partial<TaskHealthSourceEntry>): void {
    const source = this.findOrCreateSource(sourceType);
    Object.assign(source, updates);
    this.report.updatedAt = nowIso();
    this.persist();
  }

  private persist(): void {
    writeTaskHealth(this.report);
  }
}

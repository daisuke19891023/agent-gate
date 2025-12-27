import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AgentGateConfig } from '../config/schema.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const logLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];

export interface ResolvedArtifacts {
  logDir: string;
  reportPath: string;
  logDirAbsolute: string;
  reportPathAbsolute: string;
  reportPretty: boolean;
}

export function resolveLogLevel(
  cliLevel: LogLevel,
  env: NodeJS.ProcessEnv | undefined,
): LogLevel {
  const envLevel = env?.AGENT_TOOLS_LOG_LEVEL;
  if (envLevel && isLogLevel(envLevel)) {
    return envLevel;
  }
  return cliLevel;
}

export function resolveArtifacts(
  repoRoot: string,
  command: string,
  config: AgentGateConfig,
  env: NodeJS.ProcessEnv | undefined,
): ResolvedArtifacts {
  const reportsConfig = config.reports;
  const logDirConfig =
    env?.AGENT_TOOLS_LOG_DIR ?? reportsConfig?.logDir ?? '.agent-gate/logs';
  const outputDirConfig = reportsConfig?.outputDir ?? '.agent-gate/reports';

  const logDirAbsolute = resolveAbsolute(repoRoot, logDirConfig);
  const reportPathRelative = toPosixPath(
    path.join(outputDirConfig, `${command}.json`),
  );
  const reportPathAbsolute = resolveAbsolute(repoRoot, reportPathRelative);

  return {
    logDir: toRepoRelative(repoRoot, logDirAbsolute),
    reportPath: toRepoRelative(repoRoot, reportPathAbsolute),
    logDirAbsolute,
    reportPathAbsolute,
    reportPretty: reportsConfig?.prettyJson ?? false,
  };
}

export async function writeReportFile(
  output: unknown,
  reportPathAbsolute: string,
  pretty: boolean,
): Promise<void> {
  await mkdir(path.dirname(reportPathAbsolute), { recursive: true });
  const json = pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
  await writeFile(reportPathAbsolute, json + '\n', 'utf8');
}

export async function ensureLogDir(logDirAbsolute: string): Promise<void> {
  await mkdir(logDirAbsolute, { recursive: true });
}

function resolveAbsolute(repoRoot: string, target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(repoRoot, target);
}

function toRepoRelative(repoRoot: string, absolutePath: string): string {
  const relative = path.relative(repoRoot, absolutePath) || '.';
  return toPosixPath(relative);
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function isLogLevel(value: string): value is LogLevel {
  return (logLevels as string[]).includes(value);
}

import { appendFileSync } from 'node:fs';
import path from 'node:path';
import type { LogLevel } from './log-level.js';

const levelWeight: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export interface LoggerContext {
  repoId: string;
  sessionId: string;
  command: string;
  step: string;
}

export interface Logger {
  log: (level: LogLevel, message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  info: (message: string, fields?: Record<string, unknown>) => void;
  debug: (message: string, fields?: Record<string, unknown>) => void;
  withStep: (step: string) => Logger;
  logFilePath: string;
}

export interface LoggerOptions {
  logDirAbsolute: string;
  level: LogLevel;
  context: Omit<LoggerContext, 'step'>;
  step?: string;
}

export function createJsonLogger(options: LoggerOptions): Logger {
  const baseStep = options.step ?? 'bootstrap';
  const logFilePath = path.join(
    options.logDirAbsolute,
    `${options.context.command}-${options.context.sessionId}.jsonl`,
  );

  const logger: Logger = {
    log: (level, message, fields) => {
      if (levelWeight[level] > levelWeight[options.level]) {
        return;
      }
      const payload: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level,
        message,
        repoId: options.context.repoId,
        sessionId: options.context.sessionId,
        command: options.context.command,
        step: baseStep,
        ...(fields ?? {}),
      };
      appendFileSync(logFilePath, JSON.stringify(payload) + '\n');
    },
    error: (message, fields) => logger.log('error', message, fields),
    warn: (message, fields) => logger.log('warn', message, fields),
    info: (message, fields) => logger.log('info', message, fields),
    debug: (message, fields) => logger.log('debug', message, fields),
    withStep: (step) =>
      createJsonLogger({
        logDirAbsolute: options.logDirAbsolute,
        level: options.level,
        context: options.context,
        step,
      }),
    logFilePath,
  };

  return logger;
}

export const logLevels = ['error', 'warn', 'info', 'debug'] as const;

export type LogLevel = (typeof logLevels)[number];

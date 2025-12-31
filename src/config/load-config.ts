import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml } from "yaml";
import { configSchema, type AgentGateConfig } from "./schema.js";

export type ConfigSource = "explicit" | "repo" | "user" | "default";

export class ConfigError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ConfigError";
    this.details = details;
  }
}

export interface LoadConfigOptions {
  configPath?: string;
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
}

export interface LoadedConfig {
  config: AgentGateConfig;
  source: ConfigSource;
  path?: string;
}

export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const env = options.env ?? process.env;
  const explicitPath = options.configPath ?? env.AGENT_GATE_CONFIG;

  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    const config = await readAndValidateConfig(resolved);
    return {
      config,
      source: "explicit",
      path: resolved
    };
  }

  const repoConfig = await findFirstConfigPath([
    path.resolve(options.repoRoot, "agent-gate.config.yaml"),
    path.resolve(options.repoRoot, "agent-gate.config.json")
  ]);

  if (repoConfig) {
    const config = await readAndValidateConfig(repoConfig);
    return {
      config,
      source: "repo",
      path: repoConfig
    };
  }

  const homeDir = os.homedir();
  const userConfig = await findFirstConfigPath([
    path.resolve(homeDir, ".config/agent-gate/config.yaml"),
    path.resolve(homeDir, ".config/agent-gate/config.json")
  ]);

  if (userConfig) {
    const config = await readAndValidateConfig(userConfig);
    return {
      config,
      source: "user",
      path: userConfig
    };
  }

  const defaultConfig = configSchema.parse({ schemaVersion: 1 });
  return {
    config: defaultConfig,
    source: "default"
  };
}

async function findFirstConfigPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

async function readAndValidateConfig(configPath: string): Promise<AgentGateConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read config file.";
    throw new ConfigError("Config file not found.", {
      path: configPath,
      reason: message
    });
  }

  if (!raw.trim()) {
    throw new ConfigError("Config file is empty.", { path: configPath });
  }

  const parsed = parseConfigContents(configPath, raw);

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError("Config schema validation failed.", {
      path: configPath,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
        message: issue.message
      }))
    });
  }

  return result.data;
}

function parseConfigContents(configPath: string, raw: string): unknown {
  const extension = path.extname(configPath).toLowerCase();

  try {
    if (extension === ".json") {
      return JSON.parse(raw) as unknown;
    }

    if (extension === ".yaml" || extension === ".yml") {
      return parseYaml(raw) as unknown;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to parse config file.";
    throw new ConfigError("Config file could not be parsed.", {
      path: configPath,
      reason: message
    });
  }

  throw new ConfigError("Unsupported config file extension.", {
    path: configPath,
    extension
  });
}

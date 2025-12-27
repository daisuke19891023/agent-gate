import { z } from "zod";

const runtimeNetworkSchema = z
  .object({
    prepare: z.enum(["default", "deny-all", "proxy"]).optional(),
    validate: z.enum(["default", "deny-all", "proxy"]).optional()
  })
  .strict();

const runtimeImagesSchema = z
  .object({
    base: z.string(),
    toolchainOverrides: z.record(z.string(), z.string()).optional()
  })
  .strict();

const runtimeEnvSchema = z
  .object({
    passthrough: z.array(z.string()).optional(),
    set: z.record(z.string(), z.string()).optional()
  })
  .strict();

const runtimeSchema = z
  .object({
    provider: z.enum(["auto", "docker", "podman", "none"]).optional(),
    network: runtimeNetworkSchema.optional(),
    images: runtimeImagesSchema.optional(),
    env: runtimeEnvSchema.optional()
  })
  .strict();

const schedulerSlotsSchema = z
  .object({
    workspace: z.number().int().positive().optional(),
    install: z.number().int().positive().optional(),
    build: z.number().int().positive().optional(),
    test: z.number().int().positive().optional(),
    lsp: z
      .object({
        start: z.number().int().positive().optional(),
        index: z.number().int().positive().optional()
      })
      .strict()
      .optional()
  })
  .strict();

const schedulerSchema = z
  .object({
    mode: z.literal("single-process").optional(),
    slots: schedulerSlotsSchema.optional()
  })
  .strict();

const workspaceCleanupSchema = z
  .object({
    ttlMinutes: z.number().int().positive().optional(),
    keepLastN: z.number().int().nonnegative().optional(),
    keepOnFailure: z.boolean().optional()
  })
  .strict();

const workspaceSchema = z
  .object({
    strategy: z.enum(["in-place", "git-worktree"]).optional(),
    baseDir: z.string().optional(),
    cleanup: workspaceCleanupSchema.optional()
  })
  .strict();

const cacheToolOverrideSchema = z
  .object({
    scope: z.enum(["workspace", "repo", "global"])
  })
  .strict();

const cacheSchema = z
  .object({
    baseDir: z.string().optional(),
    profile: z.enum(["safe", "balanced", "aggressive"]).optional(),
    toolOverrides: z.record(z.string(), cacheToolOverrideSchema).optional()
  })
  .strict();

const scopeSchema = z
  .object({
    defaultMode: z.enum(["changed", "all"]).optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    onNoChanges: z.enum(["ok", "skip", "fail"]).optional(),
    reportPotentialImpacts: z.boolean().optional()
  })
  .strict();

const nodeInstallSchema = z
  .object({
    mode: z.enum(["auto", "ci", "install"]).optional(),
    workingDirectory: z.string().optional()
  })
  .strict();

const nodeTypecheckFallbackSchema = z
  .object({
    enabled: z.boolean().optional(),
    command: z.string().optional()
  })
  .strict();

const nodeTypecheckOverrideSchema = z
  .object({
    projectRoot: z.string(),
    command: z.string()
  })
  .strict();

const nodeTypecheckSchema = z
  .object({
    scriptName: z.string().optional(),
    fallback: nodeTypecheckFallbackSchema.optional(),
    overrides: z.array(nodeTypecheckOverrideSchema).optional()
  })
  .strict();

const nodeSchema = z
  .object({
    enabled: z.boolean().optional(),
    packageManager: z.enum(["auto", "pnpm", "npm", "yarn"]).optional(),
    install: nodeInstallSchema.optional(),
    typecheck: nodeTypecheckSchema.optional()
  })
  .strict();

const pythonInstallSchema = z
  .object({
    mode: z.enum(["auto", "sync", "install"]).optional()
  })
  .strict();

const pythonTypecheckOverrideSchema = z
  .object({
    projectRoot: z.string(),
    command: z.string()
  })
  .strict();

const pythonTypecheckSchema = z
  .object({
    tool: z.literal("pyright").optional(),
    overrides: z.array(pythonTypecheckOverrideSchema).optional()
  })
  .strict();

const pythonSchema = z
  .object({
    enabled: z.boolean().optional(),
    manager: z.enum(["auto", "uv", "pip", "poetry"]).optional(),
    install: pythonInstallSchema.optional(),
    typecheck: pythonTypecheckSchema.optional()
  })
  .strict();

const reservedToolchainSchema = z
  .object({
    enabled: z.boolean().optional()
  })
  .passthrough();

const toolchainsSchema = z
  .object({
    node: nodeSchema.optional(),
    python: pythonSchema.optional(),
    java: reservedToolchainSchema.optional(),
    csharp: reservedToolchainSchema.optional()
  })
  .strict();

const lspRestartSchema = z
  .object({
    maxRestarts: z.number().int().nonnegative().optional(),
    backoffMs: z.array(z.number().int().nonnegative()).optional()
  })
  .strict();

const lspLifecycleSchema = z
  .object({
    idleTtlMinutes: z.number().int().positive().optional(),
    restart: lspRestartSchema.optional()
  })
  .strict();

const lspServerSchema = z
  .object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    initializationOptions: z.record(z.string(), z.unknown()).optional(),
    settings: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const lspSchema = z
  .object({
    enabled: z.boolean().optional(),
    lifecycle: lspLifecycleSchema.optional(),
    servers: z.record(z.string(), lspServerSchema).optional()
  })
  .strict();

const reportsRedactSchema = z
  .object({
    enabled: z.boolean().optional(),
    patterns: z.array(z.string()).optional(),
    keys: z.array(z.string()).optional()
  })
  .strict();

const reportsSchema = z
  .object({
    outputDir: z.string().optional(),
    logDir: z.string().optional(),
    prettyJson: z.boolean().optional(),
    maxDiagnostics: z.number().int().positive().optional(),
    redact: reportsRedactSchema.optional()
  })
  .strict();

const securitySchema = z
  .object({
    redactEnvKeys: z.array(z.string()).optional(),
    maxLogBytesPerStep: z.number().int().positive().optional(),
    allowDangerousCommands: z.boolean().optional()
  })
  .strict();

export const configSchema = z
  .object({
    schemaVersion: z.literal(1),
    runtime: runtimeSchema.optional(),
    scheduler: schedulerSchema.optional(),
    workspace: workspaceSchema.optional(),
    cache: cacheSchema.optional(),
    scope: scopeSchema.optional(),
    toolchains: toolchainsSchema.optional(),
    lsp: lspSchema.optional(),
    reports: reportsSchema.optional(),
    security: securitySchema.optional()
  })
  .strict();

export type AgentGateConfig = z.infer<typeof configSchema>;

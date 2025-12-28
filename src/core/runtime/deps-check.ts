import { stat } from "node:fs/promises";
import path from "node:path";

export interface DependencyCheckResult {
  required: boolean;
  missing: boolean;
  reasons: string[];
}

interface DependencySignal {
  kind: "node" | "python";
  manifests: string[];
  dependencyDirs: string[];
}

const dependencySignals: DependencySignal[] = [
  {
    kind: "node",
    manifests: ["package.json"],
    dependencyDirs: ["node_modules"]
  },
  {
    kind: "python",
    manifests: ["pyproject.toml", "requirements.txt", "requirements-dev.txt"],
    dependencyDirs: [".venv", "venv"]
  }
];

export async function checkDependencyStatus(repoRoot: string): Promise<DependencyCheckResult> {
  const reasons: string[] = [];
  let required = false;
  let missing = false;

  for (const signal of dependencySignals) {
    const hasManifest = await hasAnyPath(repoRoot, signal.manifests);
    if (!hasManifest) {
      continue;
    }

    required = true;
    const hasDeps = await hasAnyPath(repoRoot, signal.dependencyDirs);
    if (!hasDeps) {
      missing = true;
      reasons.push(
        `${signal.kind} dependencies are missing (expected ${signal.dependencyDirs.join(", ")}).`
      );
    }
  }

  return {
    required,
    missing,
    reasons
  };
}

async function hasAnyPath(repoRoot: string, candidates: string[]): Promise<boolean> {
  for (const candidate of candidates) {
    if (await pathExists(path.join(repoRoot, candidate))) {
      return true;
    }
  }
  return false;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

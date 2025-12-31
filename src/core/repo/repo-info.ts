import { createHash } from "node:crypto";
import path from "node:path";
import { runCommand } from "../process/run-command.js";

export interface RepoVcsInfo {
  kind: "git";
  head?: string;
}

export interface RepoInfo {
  id: string;
  vcs?: RepoVcsInfo;
}

export async function getRepoInfo(repoRoot: string): Promise<RepoInfo> {
  const normalizedRoot = path.resolve(repoRoot).replace(/\\/g, "/");
  const head = await tryGetGitHead(repoRoot);

  const hash = createHash("sha256");
  hash.update(normalizedRoot);
  if (head) {
    hash.update(":");
    hash.update(head);
  }

  const id = hash.digest("hex").slice(0, 12);
  const info: RepoInfo = { id };

  if (head) {
    info.vcs = { kind: "git", head };
  }

  return info;
}

async function tryGetGitHead(repoRoot: string): Promise<string | null> {
  try {
    const result = await runCommand({
      command: "git",
      args: ["rev-parse", "HEAD"],
      cwd: repoRoot,
      timeoutMs: 5000
    });
    if (result.exitCode !== 0) {
      return null;
    }
    const head = result.stdout.trim();
    return head.length > 0 ? head : null;
  } catch {
    return null;
  }
}

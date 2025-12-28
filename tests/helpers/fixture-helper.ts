import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

/**
 * Options for setting up a fixture.
 */
export interface FixtureOptions {
  /** Initialize as a git repository. Default: true */
  initGit?: boolean;
  /** Files to stage after initial commit */
  stagedFiles?: string[];
  /** Files to modify (without staging) */
  modifiedFiles?: string[];
  /** Files to create as untracked */
  untrackedFiles?: Array<{ path: string; content: string }>;
}

/**
 * Result of setting up a fixture.
 */
export interface FixtureSetup {
  /** Root directory of the copied fixture */
  root: string;
  /** Cleanup function to remove the temp directory */
  cleanup: () => Promise<void>;
}

/**
 * Copy a fixture to a temporary directory and optionally set up git state.
 */
export async function setupFixture(
  fixtureName: string,
  options: FixtureOptions = {}
): Promise<FixtureSetup> {
  const { initGit = true, stagedFiles = [], modifiedFiles = [], untrackedFiles = [] } = options;

  const sourcePath = path.join(FIXTURES_DIR, fixtureName);
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), `agent-gate-test-${fixtureName}-`));

  // Copy fixture to temp directory
  await copyDir(sourcePath, tempDir);

  // Initialize git if requested
  if (initGit) {
    await initGitRepo(tempDir);

    // Modify files (creates unstaged changes)
    for (const file of modifiedFiles) {
      await modifyFile(tempDir, file);
    }

    // Stage files
    for (const file of stagedFiles) {
      await stageFile(tempDir, file);
    }

    // Create untracked files
    for (const { path: filePath, content } of untrackedFiles) {
      await createFile(tempDir, filePath, content);
    }
  }

  return {
    root: tempDir,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

/**
 * Initialize a git repository with an initial commit.
 */
export async function initGitRepo(root: string): Promise<void> {
  await runGit(root, ["init"]);
  await runGit(root, ["config", "user.email", "test@example.com"]);
  await runGit(root, ["config", "user.name", "Test User"]);
  await runGit(root, ["add", "."]);
  await runGit(root, ["commit", "-m", "Initial commit"]);
}

/**
 * Stage a file in a git repository.
 */
export async function stageFile(root: string, file: string): Promise<void> {
  await runGit(root, ["add", file]);
}

/**
 * Modify a file by appending content.
 */
export async function modifyFile(root: string, file: string): Promise<void> {
  const filePath = path.join(root, file);
  const content = await fs.readFile(filePath, "utf-8");
  await fs.writeFile(filePath, content + "\n// Modified for test\n");
}

/**
 * Create a new file (will be untracked).
 */
export async function createFile(root: string, filePath: string, content: string): Promise<void> {
  const fullPath = path.join(root, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content);
}

/**
 * Run a git command in the specified directory.
 */
async function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    child.on("error", reject);
  });
}

/**
 * Directories to skip when copying fixtures.
 */
const SKIP_DIRS = new Set([".venv", ".git", "node_modules", "__pycache__", ".agent-gate"]);

/**
 * Recursively copy a directory.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    // Skip certain directories
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isSymbolicLink()) {
      // Copy symlink as-is
      const linkTarget = await fs.readlink(srcPath);
      await fs.symlink(linkTarget, destPath);
    } else if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Get the list of changed files in a git repository.
 */
export async function getChangedFiles(root: string): Promise<string[]> {
  const staged = await runGit(root, ["diff", "--name-only", "--cached"]);
  const unstaged = await runGit(root, ["diff", "--name-only"]);
  const untracked = await runGit(root, ["ls-files", "--others", "--exclude-standard"]);

  const files = new Set<string>();
  for (const output of [staged, unstaged, untracked]) {
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        files.add(trimmed);
      }
    }
  }

  return Array.from(files).sort();
}

/**
 * Get the current git branch name.
 */
export async function getCurrentBranch(root: string): Promise<string> {
  const result = await runGit(root, ["branch", "--show-current"]);
  return result.trim();
}

/**
 * Create a new git branch and optionally switch to it.
 */
export async function createBranch(
  root: string,
  branchName: string,
  checkout = true
): Promise<void> {
  if (checkout) {
    await runGit(root, ["checkout", "-b", branchName]);
  } else {
    await runGit(root, ["branch", branchName]);
  }
}

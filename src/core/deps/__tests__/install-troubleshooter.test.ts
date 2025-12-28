import { describe, it, expect } from "vitest";
import { troubleshootInstall, getDepsNextActions } from "../install-troubleshooter.js";
import type { DepsError } from "../types.js";

describe("troubleshootInstall", () => {
  describe("TIMEOUT detection", () => {
    it("detects timeout", () => {
      const result = troubleshootInstall("npm", 1, "", "", true);
      expect(result.code).toBe("TIMEOUT");
      expect(result.nextActions.length).toBeGreaterThan(0);
    });
  });

  describe("LOCKFILE_DRIFT detection", () => {
    it("detects npm ci lockfile mismatch", () => {
      const stderr = `npm ERR! \`npm ci\` can only install packages when your package-lock.json
npm ERR! and package.json are in sync. Please update your lock file with \`npm install\`.`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("LOCKFILE_DRIFT");
    });

    it("detects pnpm frozen lockfile error", () => {
      const stderr = `ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile"`;
      const result = troubleshootInstall("pnpm", 1, stderr, "");
      expect(result.code).toBe("LOCKFILE_DRIFT");
    });

    it("detects yarn immutable error", () => {
      const stderr = `error Your lockfile needs to be updated, but yarn was run with \`--immutable\`.`;
      const result = troubleshootInstall("yarn", 1, stderr, "");
      expect(result.code).toBe("LOCKFILE_DRIFT");
    });
  });

  describe("AUTH_REQUIRED detection", () => {
    it("detects npm 401", () => {
      const stderr = `npm ERR! 401 Unauthorized - GET https://registry.npmjs.org/@private/pkg`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("AUTH_REQUIRED");
    });

    it("detects npm 403", () => {
      const stderr = `npm ERR! 403 Forbidden - GET https://registry.npmjs.org/@private/pkg`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("AUTH_REQUIRED");
    });

    it("detects ENEEDAUTH", () => {
      const stderr = `npm ERR! code ENEEDAUTH
npm ERR! need auth This command requires you to be logged in.`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("AUTH_REQUIRED");
    });
  });

  describe("NETWORK_BLOCKED detection", () => {
    it("detects ENOTFOUND", () => {
      const stderr = `npm ERR! code ENOTFOUND
npm ERR! network request to https://registry.npmjs.org failed`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("NETWORK_BLOCKED");
    });

    it("detects ECONNREFUSED", () => {
      const stderr = `npm ERR! code ECONNREFUSED
npm ERR! network connect ECONNREFUSED 127.0.0.1:4873`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("NETWORK_BLOCKED");
    });

    it("detects Python connection refused", () => {
      const stderr = `Could not fetch URL https://pypi.org/simple/requests/: Connection refused`;
      const result = troubleshootInstall("pip", 1, stderr, "");
      expect(result.code).toBe("NETWORK_BLOCKED");
    });
  });

  describe("CACHE_CORRUPTION detection", () => {
    it("detects EINTEGRITY", () => {
      const stderr = `npm ERR! code EINTEGRITY
npm ERR! sha512-abcd integrity checksum failed`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("CACHE_CORRUPTION");
    });

    it("detects Python hash mismatch", () => {
      const stderr = `ERROR: Hash mismatch for package-1.0.0.tar.gz`;
      const result = troubleshootInstall("pip", 1, stderr, "");
      expect(result.code).toBe("CACHE_CORRUPTION");
    });
  });

  describe("TOOLCHAIN_MISSING detection", () => {
    it("detects command not found", () => {
      const stderr = `bash: pnpm: command not found`;
      const result = troubleshootInstall("pnpm", null, stderr, "");
      expect(result.code).toBe("TOOLCHAIN_MISSING");
    });

    it("detects Python pip not found", () => {
      const stderr = `/bin/sh: pip: command not found`;
      const result = troubleshootInstall("pip", null, stderr, "");
      expect(result.code).toBe("TOOLCHAIN_MISSING");
    });
  });

  describe("PACKAGE_NOT_FOUND detection", () => {
    it("detects npm 404", () => {
      const stderr = `npm ERR! 404 Not Found - GET https://registry.npmjs.org/@nonexistent/pkg`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("PACKAGE_NOT_FOUND");
    });

    it("detects Python no matching distribution", () => {
      const stderr = `ERROR: No matching distribution found for nonexistent-package==1.0.0`;
      const result = troubleshootInstall("pip", 1, stderr, "");
      expect(result.code).toBe("PACKAGE_NOT_FOUND");
    });
  });

  describe("DISK_FULL detection", () => {
    it("detects ENOSPC", () => {
      const stderr = `npm ERR! code ENOSPC
npm ERR! syscall write`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("DISK_FULL");
    });
  });

  describe("PERMISSION_DENIED detection", () => {
    it("detects EACCES", () => {
      const stderr = `npm ERR! code EACCES
npm ERR! syscall mkdir`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("PERMISSION_DENIED");
    });
  });

  describe("UNKNOWN fallback", () => {
    it("returns UNKNOWN for unrecognized errors", () => {
      const stderr = `Some random error message that doesn't match any pattern`;
      const result = troubleshootInstall("npm", 1, stderr, "");
      expect(result.code).toBe("UNKNOWN");
    });
  });

  describe("success case", () => {
    it("returns UNKNOWN with no nextActions for exit code 0", () => {
      const result = troubleshootInstall("npm", 0, "", "");
      expect(result.code).toBe("UNKNOWN");
      expect(result.nextActions).toHaveLength(0);
    });
  });
});

describe("getDepsNextActions", () => {
  it("returns lockfile update commands for LOCKFILE_DRIFT", () => {
    const error: DepsError = { code: "LOCKFILE_DRIFT", message: "test" };
    const actions = getDepsNextActions(error);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].kind).toBe("update-lockfile");
  });

  it("does not emit commands for AUTH_REQUIRED (security)", () => {
    const error: DepsError = { code: "AUTH_REQUIRED", message: "test" };
    const actions = getDepsNextActions(error);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].kind).toBe("configure-auth");
    expect(actions[0].commands).toBeUndefined();
  });

  it("includes run-prepare for NETWORK_BLOCKED", () => {
    const error: DepsError = { code: "NETWORK_BLOCKED", message: "test" };
    const actions = getDepsNextActions(error);
    expect(actions.some((a) => a.kind === "run-prepare")).toBe(true);
  });

  it("includes cache clear commands for CACHE_CORRUPTION", () => {
    const error: DepsError = { code: "CACHE_CORRUPTION", message: "test" };
    const actions = getDepsNextActions(error);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].kind).toBe("clear-cache");
  });

  it("includes install hints for TOOLCHAIN_MISSING", () => {
    const error: DepsError = { code: "TOOLCHAIN_MISSING", message: "test" };
    const actions = getDepsNextActions(error);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].kind).toBe("install-toolchain");
  });
});

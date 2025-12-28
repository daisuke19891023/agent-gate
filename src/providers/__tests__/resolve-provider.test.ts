import { describe, expect, it, vi } from "vitest";
import { resolveProvider } from "../resolve-provider.js";

describe("resolveProvider", () => {
  it("returns explicit docker provider", async () => {
    const result = await resolveProvider("docker");

    expect(result.kind).toBe("docker");
    expect(result.provider?.kind).toBe("docker");
  });

  it("returns explicit podman provider", async () => {
    const result = await resolveProvider("podman");

    expect(result.kind).toBe("podman");
    expect(result.provider?.kind).toBe("podman");
  });

  it("returns none when preference is none", async () => {
    const result = await resolveProvider("none");

    expect(result.kind).toBe("none");
    expect(result.provider).toBeNull();
  });

  it("prefers docker when auto and docker available", async () => {
    const isAvailable = vi.fn(async (command: "docker" | "podman") => {
      return command === "docker";
    });

    const result = await resolveProvider("auto", { isAvailable });

    expect(result.kind).toBe("docker");
    expect(isAvailable).toHaveBeenCalledWith("docker");
  });

  it("falls back to podman when docker unavailable", async () => {
    const isAvailable = vi.fn(async (command: "docker" | "podman") => {
      return command === "podman";
    });

    const result = await resolveProvider("auto", { isAvailable });

    expect(result.kind).toBe("podman");
    expect(isAvailable).toHaveBeenCalledWith("docker");
    expect(isAvailable).toHaveBeenCalledWith("podman");
  });

  it("returns none when no provider is available", async () => {
    const isAvailable = vi.fn(async () => false);

    const result = await resolveProvider("auto", { isAvailable });

    expect(result.kind).toBe("none");
    expect(result.provider).toBeNull();
  });
});

import type { ContainerProvider, ContainerRunOptions } from "./types.js";

export class DockerProvider implements ContainerProvider {
  readonly kind = "docker" as const;

  buildRunArgs(options: ContainerRunOptions): string[] {
    const args: string[] = ["run", "--rm"];

    if (options.networkPolicy === "deny-all") {
      args.push("--network", "none");
    }

    args.push(options.image);

    if (options.command && options.command.length > 0) {
      args.push(...options.command);
    }

    return args;
  }
}

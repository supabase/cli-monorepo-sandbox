import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { extractFailureContext } from "../format.ts";
import type { Check } from "../types.ts";

export const check: Check = async (ctx) => {
  if (ctx.quick) {
    return { id: 7, label: "legacy shell build produces binary", status: "skip", detail: "--quick" };
  }

  const result =
    await $`pnpm exec bun apps/cli/scripts/build.ts --version 0.0.0-test --shell legacy`
      .cwd(ctx.cwd)
      .quiet()
      .nothrow();
  if (result.exitCode !== 0) {
    const combined = `${result.stdout.toString()}\n${result.stderr.toString()}`;
    return { id: 7, label: "legacy shell build produces binary", status: "fail", detail: extractFailureContext(combined) };
  }

  const packagesDir = join(ctx.cwd, "packages");
  if (!existsSync(packagesDir)) {
    return { id: 7, label: "legacy shell build produces binary", status: "fail", detail: "packages/ missing" };
  }

  const cliPlatformDirs = readdirSync(packagesDir).filter((d) => d.startsWith("cli-"));
  const built = cliPlatformDirs.filter((d) => existsSync(join(packagesDir, d, "bin")));
  if (built.length === 0) {
    return { id: 7, label: "legacy shell build produces binary", status: "fail", detail: "no packages/cli-*/bin/ produced" };
  }

  return {
    id: 7,
    label: "legacy shell build produces binary",
    status: "pass",
    detail: `binaries in ${built.length} packages/cli-*/`,
  };
};

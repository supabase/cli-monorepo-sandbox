import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import type { Check } from "../types.ts";

export const check: Check = async (ctx) => {
  if (ctx.quick) {
    return { id: 3, label: "pnpm install clean + lockfile sweep", status: "skip", detail: "--quick" };
  }

  const result = await $`pnpm install --frozen-lockfile=false`.cwd(ctx.cwd).quiet().nothrow();
  if (result.exitCode !== 0) {
    const tail = result.stderr.toString().trim().split("\n").slice(-5).join(" / ");
    return { id: 3, label: "pnpm install clean + lockfile sweep", status: "fail", detail: tail };
  }

  const lockPath = join(ctx.cwd, "pnpm-lock.yaml");
  if (existsSync(lockPath)) {
    const lock = readFileSync(lockPath, "utf8");
    const re = /^\s+supabase:\s/m;
    if (re.test(lock)) {
      return {
        id: 3,
        label: "pnpm install clean + lockfile sweep",
        status: "fail",
        detail: "pnpm-lock.yaml still references the unscoped `supabase` package",
      };
    }
  }

  return { id: 3, label: "pnpm install clean + lockfile sweep", status: "pass" };
};

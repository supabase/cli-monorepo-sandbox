import { existsSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { log } from "../log.ts";
import type { RunContext } from "../types.ts";

/**
 * Refresh `pnpm-lock.yaml` so it matches the post-merge package.json set.
 *
 * `git mv` of the merged tree + Phase 8's `nx`-block patches to
 * `apps/cli/package.json` and `apps/cli-e2e/package.json` aren't
 * dependency changes — pnpm doesn't care about the `nx` field. But the
 * dropped `apps/cli-go/package.json` (the unscoped `supabase` wrapper)
 * IS a workspace-membership change: if `pnpm-workspace.yaml` glob includes
 * `apps/*`, pnpm previously saw a package at `apps/cli-go/` and now
 * doesn't. The lockfile records the importer set, so it goes out of sync.
 *
 * `--lockfile-only` updates the lockfile without downloading anything or
 * running lifecycle scripts — fast and side-effect-free. The Phase 10
 * commit will pick up the refreshed lockfile.
 */
export async function syncLockfile(ctx: RunContext): Promise<void> {
  log.phase("Phase 9", "sync pnpm-lock.yaml against the post-merge package.json set");

  if (!existsSync(join(ctx.cwd, "pnpm-lock.yaml"))) {
    log.info("no pnpm-lock.yaml at root; skipping");
    return;
  }
  if (!existsSync(join(ctx.cwd, "package.json"))) {
    log.info("no package.json at root; skipping");
    return;
  }

  log.step("running pnpm install --lockfile-only …");
  const result = await $`pnpm install --lockfile-only`.cwd(ctx.cwd).quiet().nothrow();
  if (result.exitCode !== 0) {
    const detail = result.stderr.toString().trim().split("\n").slice(-5).join(" / ");
    throw new Error(`pnpm install --lockfile-only failed: ${detail}`);
  }
  log.ok("pnpm-lock.yaml synced");
}

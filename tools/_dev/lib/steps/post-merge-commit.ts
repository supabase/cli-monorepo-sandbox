import { git } from "../git.ts";
import { log } from "../log.ts";
import type { RunContext } from "../types.ts";

const MESSAGE = "chore(monorepo): post-merge fixups (paths, workflows, nx-go, readmes, docs, lockfile)";

export async function postMergeCommit(ctx: RunContext): Promise<void> {
  log.phase("Phase 10", "single commit for path fixups + workflow lift + plugin + readme swap + docs + lockfile");

  const clean = await git.isClean(ctx);
  if (clean) {
    log.warn("nothing to commit; phases 3-9 produced no changes");
    return;
  }

  await git.commitAll(ctx, MESSAGE);
  const sha = await git.headSha(ctx);
  log.ok(`committed (${sha.slice(0, 8)})`);
}

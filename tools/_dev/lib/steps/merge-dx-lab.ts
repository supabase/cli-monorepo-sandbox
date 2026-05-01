import { git } from "../git.ts";
import { log } from "../log.ts";
import { DX_LAB_REMOTE, type RunContext } from "../types.ts";

export async function mergeDxLab(ctx: RunContext): Promise<void> {
  log.phase("Phase 2", `add ${DX_LAB_REMOTE} remote, fetch, merge`);

  if (await git.remoteExists(ctx, DX_LAB_REMOTE)) {
    throw new Error(`remote ${DX_LAB_REMOTE} already exists; precondition reset should have removed it`);
  }

  await git.addRemote(ctx, DX_LAB_REMOTE, ctx.args.dxLabSource);
  log.ok(`added remote ${DX_LAB_REMOTE} -> ${ctx.args.dxLabSource}`);

  ctx.rollback.push(`remove remote ${DX_LAB_REMOTE}`, async () => {
    if (await git.remoteExists(ctx, DX_LAB_REMOTE)) {
      await git.removeRemote(ctx, DX_LAB_REMOTE);
    }
  });

  log.step(`fetching ${DX_LAB_REMOTE} (with tags)…`);
  await git.fetch(ctx, DX_LAB_REMOTE, ["--tags"]);
  log.ok(`fetched ${DX_LAB_REMOTE}`);

  const mergeRef = `${DX_LAB_REMOTE}/${ctx.args.dxLabBranch}`;
  log.step(`merging ${mergeRef} (--allow-unrelated-histories)…`);

  const result = await git.merge(ctx, mergeRef, [
    "--allow-unrelated-histories",
    "--no-edit",
    "-m",
    `chore(monorepo): merge ${mergeRef} into consolidated tree`,
  ]);

  if (!result.ok) {
    log.error(`merge produced conflicts on ${result.conflicts.length} path(s):`);
    for (const path of result.conflicts) log.error(`  ${path}`);
    await git.abortMerge(ctx);
    throw new Error(
      `unexpected conflicts under Option A; aborting. paths: ${result.conflicts.join(", ")}`,
    );
  }

  const sha = await git.headSha(ctx);
  log.ok(`merge committed (${sha.slice(0, 8)})`);
}

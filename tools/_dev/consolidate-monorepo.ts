#!/usr/bin/env bun
import { parseArgs } from "./lib/args.ts";
import { log } from "./lib/log.ts";
import { createRollback } from "./lib/rollback.ts";
import { addNxGoPlugin } from "./lib/steps/add-nx-go-plugin.ts";
import { docSweep } from "./lib/steps/doc-sweep.ts";
import { dropGoReleaseArtifacts } from "./lib/steps/drop-release-artifacts.ts";
import { liftGoWorkflows } from "./lib/steps/lift-workflows.ts";
import { mergeDxLab } from "./lib/steps/merge-dx-lab.ts";
import { moveUnderCliGo } from "./lib/steps/move-under-cli-go.ts";
import { pathFixups } from "./lib/steps/path-fixups.ts";
import { postMergeCommit } from "./lib/steps/post-merge-commit.ts";
import { runPreconditions } from "./lib/steps/preconditions.ts";
import { swapReadmes } from "./lib/steps/swap-readmes.ts";
import { syncLockfile } from "./lib/steps/sync-lockfile.ts";
import type { RunContext } from "./lib/types.ts";
import { runVerification } from "./lib/verify/runner.ts";

const args = parseArgs(process.argv.slice(2));

const ctx: RunContext = {
  args,
  cwd: args.targetDir,
  rollback: createRollback(),
  startingBranch: "",
  startingSha: "",
};

log.banner(
  "consolidate-monorepo",
  `target=${ctx.cwd} dx-lab=${args.dxLabSource}#${args.dxLabBranch} branch=${args.consolidationBranch}`,
);

try {
  await runPreconditions(ctx);

  if (!args.verifyOnly) {
    await moveUnderCliGo(ctx);
    await mergeDxLab(ctx);
    await liftGoWorkflows(ctx);
    await pathFixups(ctx);
    await dropGoReleaseArtifacts(ctx);
    await swapReadmes(ctx);
    await docSweep(ctx);
    await addNxGoPlugin(ctx);
    await syncLockfile(ctx);
    await postMergeCommit(ctx);
  }

  ctx.rollback.clear();

  if (args.skipVerify) {
    log.banner("done", `${ctx.args.consolidationBranch} ready (verification skipped)`);
  } else {
    log.phase(
      "Phase 11",
      `verification (${args.quickVerify ? "quick mode" : "full"}${args.releaseSmoke ? " +release-smoke" : ""})`,
    );
    const { failed } = await runVerification({
      cwd: ctx.cwd,
      quick: args.quickVerify,
      releaseSmoke: args.releaseSmoke,
    });
    if (failed > 0) {
      log.banner("verification failed", `${failed} check(s) failed; merged branch left in place for inspection`);
      process.exit(1);
    }
    log.banner("done", `${ctx.args.consolidationBranch} ready, all required checks passed`);
  }
} catch (err) {
  log.fatal((err as Error).message);
  if (process.env.DEBUG) console.error(err);
  log.warn(`rolling back ${ctx.rollback.size()} step(s)…`);
  await ctx.rollback.replay();
  log.warn("rollback complete");
  process.exit(1);
}

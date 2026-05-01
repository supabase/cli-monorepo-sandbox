import { existsSync } from "node:fs";
import { join } from "node:path";
import { git } from "../git.ts";
import { log } from "../log.ts";
import {
  DX_LAB_REMOTE,
  PRE_CONSOLIDATION_TAG,
  type RunContext,
} from "../types.ts";

interface MarkerState {
  tag: boolean;
  remote: boolean;
  appsCliGoMain: boolean;
  branch: boolean;
}

async function inspectMarkers(ctx: RunContext): Promise<MarkerState> {
  return {
    tag: await git.tagExists(ctx, PRE_CONSOLIDATION_TAG),
    remote: await git.remoteExists(ctx, DX_LAB_REMOTE),
    appsCliGoMain: existsSync(join(ctx.cwd, "apps/cli-go/main.go")),
    branch: await git.branchExists(ctx, ctx.args.consolidationBranch),
  };
}

interface TagPayload {
  branch: string;
  sha: string;
}

function encodePayload(p: TagPayload): string {
  return [
    "consolidate-monorepo: pre-consolidation marker",
    "",
    `starting-branch: ${p.branch}`,
    `starting-sha: ${p.sha}`,
  ].join("\n");
}

function decodePayload(message: string): TagPayload | null {
  const branch = /starting-branch:\s*(\S+)/.exec(message)?.[1];
  const sha = /starting-sha:\s*(\S+)/.exec(message)?.[1];
  if (!branch || !sha) return null;
  return { branch, sha };
}

export async function runPreconditions(ctx: RunContext): Promise<void> {
  log.phase("Phase 0", "preconditions + re-run detection + marker tag");

  if (!(await git.insideWorkTree(ctx))) {
    throw new Error(`${ctx.cwd} is not a git working tree`);
  }
  log.ok(`inside git work tree at ${ctx.cwd}`);

  const markers = await inspectMarkers(ctx);
  const anyMarker = markers.tag || markers.remote || markers.appsCliGoMain || markers.branch;

  if (anyMarker) {
    if (ctx.args.noReset) {
      throw new Error(
        `consolidation markers detected (tag=${markers.tag} remote=${markers.remote} apps/cli-go=${markers.appsCliGoMain} branch=${markers.branch}); --no-reset specified, aborting`,
      );
    }

    if (!markers.tag) {
      throw new Error(
        `markers detected (remote/apps-cli-go/branch) but ${PRE_CONSOLIDATION_TAG} tag is missing; refusing to reset blindly. clean the working tree manually first.`,
      );
    }

    const payload = decodePayload(await git.readTagMessage(ctx, PRE_CONSOLIDATION_TAG));
    if (!payload) {
      throw new Error(
        `could not decode ${PRE_CONSOLIDATION_TAG} tag payload; expected starting-branch and starting-sha annotations`,
      );
    }

    log.warn(`re-run detected. resetting to ${PRE_CONSOLIDATION_TAG} (${payload.sha.slice(0, 8)} on ${payload.branch})`);

    if (markers.remote) {
      await git.removeRemote(ctx, DX_LAB_REMOTE);
      log.step(`removed remote ${DX_LAB_REMOTE}`);
    }

    // If we're on the consolidation branch, get off it before deleting it.
    // Reset HEAD first to absorb any uncommitted leftovers, then switch to
    // the starting branch. We do NOT reset to PRE_CONSOLIDATION_TAG because
    // that would also force the starting branch back to the old tip if we
    // happened to be on it — silently discarding any new commits the user
    // pulled or pushed there since the last run.
    const currentBranch = (await git.currentBranch(ctx).catch(() => ""));
    if (currentBranch === ctx.args.consolidationBranch) {
      await git.resetHard(ctx, "HEAD");
      log.step("reset --hard HEAD (clear consolidation branch tip)");
      await git.run(ctx, ["clean", "-fdx"]);
      log.step("git clean -fdx (drop partial-run leftovers + ignored)");
      await git.checkout(ctx, payload.branch);
      log.step(`switched back to ${payload.branch}`);
    } else {
      // Already on the starting branch (or some other branch). Don't touch
      // its commit history — just drop untracked/ignored leftovers from the
      // previous merged tree (node_modules, .nx caches, etc.).
      await git.run(ctx, ["clean", "-fdx"]);
      log.step("git clean -fdx (drop partial-run leftovers + ignored)");
    }

    if (markers.branch) {
      await git.deleteBranch(ctx, ctx.args.consolidationBranch).catch(() => {});
      log.step(`deleted branch ${ctx.args.consolidationBranch}`);
    }
  }

  if (!(await git.isClean(ctx))) {
    throw new Error("working tree is not clean; commit or stash changes before running");
  }
  log.ok("working tree clean");

  ctx.startingBranch = await git.currentBranch(ctx);
  ctx.startingSha = await git.headSha(ctx);
  log.info(`starting branch: ${ctx.startingBranch} @ ${ctx.startingSha.slice(0, 8)}`);

  await git.addAnnotatedTag(
    ctx,
    PRE_CONSOLIDATION_TAG,
    ctx.startingSha,
    encodePayload({ branch: ctx.startingBranch, sha: ctx.startingSha }),
    true,
  );
  log.ok(`tagged ${PRE_CONSOLIDATION_TAG} at ${ctx.startingSha.slice(0, 8)}`);

  ctx.rollback.push(`delete tag ${PRE_CONSOLIDATION_TAG}`, async () => {
    if (await git.tagExists(ctx, PRE_CONSOLIDATION_TAG)) {
      await git.deleteTag(ctx, PRE_CONSOLIDATION_TAG);
    }
  });

  await git.createBranch(ctx, ctx.args.consolidationBranch);
  log.ok(`created and checked out ${ctx.args.consolidationBranch}`);

  ctx.rollback.push(
    `restore ${ctx.startingBranch}, drop ${ctx.args.consolidationBranch}`,
    async () => {
      // Reset first so any uncommitted changes from the failed phase don't
      // block the checkout. Then drop untracked leftovers.
      await git.resetHard(ctx, ctx.startingSha).catch((err) => {
        log.warn(`pre-checkout reset failed: ${(err as Error).message}`);
      });
      await git.run(ctx, ["clean", "-fdx"]).catch((err) => {
        log.warn(`git clean failed: ${(err as Error).message}`);
      });
      await git.checkout(ctx, ctx.startingBranch).catch((err) => {
        log.warn(`checkout ${ctx.startingBranch} failed: ${(err as Error).message}`);
      });
      // Don't force-reset the starting branch — the script never commits to
      // it, so it's whatever the user had pulled/set. Resetting would
      // silently discard their commits.
      if (await git.branchExists(ctx, ctx.args.consolidationBranch)) {
        await git.deleteBranch(ctx, ctx.args.consolidationBranch).catch((err) => {
          log.warn(`delete branch ${ctx.args.consolidationBranch} failed: ${(err as Error).message}`);
        });
      }
    },
  );
}

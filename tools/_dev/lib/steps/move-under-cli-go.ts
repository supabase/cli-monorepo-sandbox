import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { git } from "../git.ts";
import { log } from "../log.ts";
import type { RunContext } from "../types.ts";

const SKIP_TOPLEVEL = new Set([".git", "apps"]);

// Paths to keep at the repository root after consolidation. These typically
// contain dev tooling that survives the merge (e.g. the consolidation script
// itself when iterating in-tree). They must already be tracked on the source
// branch — they're handled as per-child moves under their parent.
const KEEP_AT_ROOT = ["tools/_dev"];

export async function moveUnderCliGo(ctx: RunContext): Promise<void> {
  log.phase("Phase 1", "git mv tracked entries under apps/cli-go/");

  const entries = await git.listTopLevelEntries(ctx);
  const movable = entries.filter((e) => !SKIP_TOPLEVEL.has(e));

  if (movable.length === 0) {
    throw new Error("no top-level entries to move (already consolidated?)");
  }

  mkdirSync(join(ctx.cwd, "apps/cli-go"), { recursive: true });
  log.step(`created apps/cli-go/ (${movable.length} entries to relocate)`);

  let moveCount = 0;
  for (const entry of movable) {
    const keptUnderEntry = KEEP_AT_ROOT.filter((k) => k === entry || k.startsWith(`${entry}/`));
    if (keptUnderEntry.length > 0) {
      moveCount += await movePerChild(ctx, entry, keptUnderEntry);
    } else {
      await git.mv(ctx, entry, `apps/cli-go/${entry}`);
      moveCount++;
    }
  }
  log.ok(`git mv'd ${moveCount} path${moveCount === 1 ? "" : "s"} under apps/cli-go/`);

  await git.commit(ctx, "chore(monorepo): move CLI sources under apps/cli-go/");
  const sha = await git.headSha(ctx);
  log.ok(`committed move (${sha.slice(0, 8)})`);
}

async function movePerChild(ctx: RunContext, entry: string, keepPaths: string[]): Promise<number> {
  // Move every direct child of `entry` to apps/cli-go/<entry>/<child>, except
  // children that match a path in keepPaths (those stay at root).
  const entryAbs = join(ctx.cwd, entry);
  if (!existsSync(entryAbs)) return 0;

  const dstAbs = join(ctx.cwd, "apps/cli-go", entry);
  mkdirSync(dstAbs, { recursive: true });

  const children = readdirSync(entryAbs);
  const skipChildren = new Set(
    keepPaths
      .filter((k) => k.startsWith(`${entry}/`))
      .map((k) => k.slice(entry.length + 1).split("/")[0]),
  );

  let moved = 0;
  for (const child of children) {
    if (skipChildren.has(child)) {
      log.info(`keeping ${entry}/${child} at root (per KEEP_AT_ROOT)`);
      continue;
    }
    await git.mv(ctx, `${entry}/${child}`, `apps/cli-go/${entry}/${child}`);
    moved++;
  }
  return moved;
}

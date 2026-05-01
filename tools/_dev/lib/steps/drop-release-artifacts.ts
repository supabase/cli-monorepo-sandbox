import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { git } from "../git.ts";
import { log } from "../log.ts";
import type { RunContext } from "../types.ts";

const ALWAYS_DROP = [
  "apps/cli-go/.goreleaser.yml",
  "apps/cli-go/scripts/postinstall.js",
  "apps/cli-go/package.json",
];

const ALWAYS_DROP_DIRS = [
  "apps/cli-go/tools/publish",
  "apps/cli-go/tools/selfhost",
  "apps/cli-go/tools/changelog",
];

const FLAG_DROP_DIRS: Array<{ path: string; keepFlag: keyof import("../types.ts").Args }> = [
  { path: "apps/cli-go/tools/bumpdoc", keepFlag: "keepBumpdoc" },
];

export async function dropGoReleaseArtifacts(ctx: RunContext): Promise<void> {
  log.phase("Phase 5", "drop Go-only release artifacts inside apps/cli-go/");

  for (const rel of ALWAYS_DROP) {
    const abs = join(ctx.cwd, rel);
    if (!existsSync(abs)) {
      log.info(`skip ${rel} (not present)`);
      continue;
    }
    await git.run(ctx, ["rm", rel]);
    log.ok(`git rm ${rel}`);
  }

  for (const rel of ALWAYS_DROP_DIRS) {
    const abs = join(ctx.cwd, rel);
    if (!existsSync(abs)) {
      log.info(`skip ${rel}/ (not present)`);
      continue;
    }
    await git.run(ctx, ["rm", "-rf", rel]);
    log.ok(`git rm -rf ${rel}/`);
  }

  for (const entry of FLAG_DROP_DIRS) {
    const abs = join(ctx.cwd, entry.path);
    if (!existsSync(abs)) {
      log.info(`skip ${entry.path}/ (not present)`);
      continue;
    }
    if (ctx.args[entry.keepFlag]) {
      log.info(`keep ${entry.path}/ (--${kebab(entry.keepFlag)} passed)`);
      continue;
    }
    await git.run(ctx, ["rm", "-rf", entry.path]);
    log.ok(`git rm -rf ${entry.path}/`);
  }

  const scriptsDir = join(ctx.cwd, "apps/cli-go/scripts");
  if (existsSync(scriptsDir) && readdirSync(scriptsDir).length === 0) {
    await git.run(ctx, ["rm", "-rf", "apps/cli-go/scripts"]).catch(() => {});
    log.info("apps/cli-go/scripts is now empty (cleaned up)");
  }
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

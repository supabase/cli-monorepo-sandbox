import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { git } from "../git.ts";
import { log } from "../log.ts";
import type { RunContext } from "../types.ts";
import { liftWorkflow } from "../workflow.ts";

const SRC_WORKFLOWS_DIR = "apps/cli-go/.github/workflows";
const DST_WORKFLOWS_DIR = ".github/workflows";

interface LiftEntry {
  src: string;
  rename: string;
  required?: boolean;
  flagOnly?: keyof Pick<import("../types.ts").Args, "includeApiSync">;
}

const LIFT_PLAN: LiftEntry[] = [
  { src: "ci.yml", rename: "cli-go-ci.yml", required: true },
  { src: "codeql-analysis.yml", rename: "cli-go-codeql.yml", required: true },
  { src: "api-sync.yml", rename: "cli-go-api-sync.yml", flagOnly: "includeApiSync" },
  { src: "pg-prove.yml", rename: "cli-go-pg-prove.yml" },
  { src: "mirror.yml", rename: "cli-go-mirror.yml" },
  { src: "mirror-image.yml", rename: "cli-go-mirror-image.yml" },
];

const DROP_LIST = [
  "release.yml",
  "release-beta.yml",
  "tag-npm.yml",
  "install.yml",
  "deploy.yml",
  "deploy-check.yml",
  "automerge.yml",
];

export async function liftGoWorkflows(ctx: RunContext): Promise<void> {
  log.phase("Phase 3", "lift Go workflows + delete apps/cli-go/.github/");

  const srcDirAbs = join(ctx.cwd, SRC_WORKFLOWS_DIR);
  const dstDirAbs = join(ctx.cwd, DST_WORKFLOWS_DIR);

  if (!existsSync(srcDirAbs)) {
    log.warn(`${SRC_WORKFLOWS_DIR} not present (sandbox without workflows?); skipping`);
  } else {
    mkdirSync(dstDirAbs, { recursive: true });
    const presentSources = new Set(readdirSync(srcDirAbs));

    for (const entry of LIFT_PLAN) {
      if (!presentSources.has(entry.src)) {
        if (entry.required) log.warn(`expected ${SRC_WORKFLOWS_DIR}/${entry.src} but it is missing`);
        continue;
      }
      if (entry.flagOnly && !ctx.args[entry.flagOnly]) {
        log.info(`skipping ${entry.src} (--${flagFlagName(entry.flagOnly)} not passed)`);
        continue;
      }
      const srcAbs = join(srcDirAbs, entry.src);
      const dstAbs = join(dstDirAbs, entry.rename);
      liftWorkflow({ src: srcAbs, dst: dstAbs });
      log.ok(`lifted ${entry.src} → ${entry.rename}`);
    }

    for (const drop of DROP_LIST) {
      if (presentSources.has(drop)) log.info(`will drop ${SRC_WORKFLOWS_DIR}/${drop}`);
    }

    await git.run(ctx, ["rm", "-rf", "apps/cli-go/.github"]);
    log.ok("removed apps/cli-go/.github");
  }
}

function flagFlagName(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

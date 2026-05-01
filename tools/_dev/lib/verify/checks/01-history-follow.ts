import { existsSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import type { Check } from "../types.ts";

// Canonical target from the RFC — exists in supabase/cli production.
// Sandbox snapshots may not carry every nested file, so fall back to the
// universal main.go to still exercise --follow through the git mv rename.
const CANDIDATES = [
  "apps/cli-go/internal/utils/credentials/keyring.go",
  "apps/cli-go/main.go",
];

export const check: Check = async (ctx) => {
  const target = CANDIDATES.find((rel) => existsSync(join(ctx.cwd, rel)));
  if (!target) {
    return {
      id: 1,
      label: "git log --follow on cli-go file",
      status: "fail",
      detail: `none of the candidate paths exist: ${CANDIDATES.join(", ")}`,
    };
  }

  const result = await $`git log --follow --oneline ${target}`.cwd(ctx.cwd).quiet().nothrow();
  if (result.exitCode !== 0) {
    return { id: 1, label: "git log --follow on cli-go file", status: "fail", detail: result.stderr.toString().trim() };
  }
  const commits = result.stdout.toString().trim().split("\n").filter(Boolean);
  if (commits.length < 2) {
    return {
      id: 1,
      label: "git log --follow on cli-go file",
      status: "fail",
      detail: `expected pre-merge history (>1 commit) on ${target}, got ${commits.length}`,
    };
  }
  return {
    id: 1,
    label: "git log --follow on cli-go file",
    status: "pass",
    detail: `${target}: ${commits.length} commits`,
  };
};

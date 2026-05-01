import { $ } from "bun";
import type { Check } from "../types.ts";

const TARGET = "apps/cli-go/main.go";

export const check: Check = async (ctx) => {
  const blame = await $`git blame --line-porcelain ${TARGET}`.cwd(ctx.cwd).quiet().nothrow();
  if (blame.exitCode !== 0) {
    return { id: 2, label: "git blame SHAs reachable", status: "fail", detail: blame.stderr.toString().trim() };
  }
  const shaMatches = blame.stdout.toString().match(/^[0-9a-f]{40} /gm) ?? [];
  const uniqueShas = new Set(shaMatches.map((s) => s.slice(0, 40)));

  for (const sha of uniqueShas) {
    const exists = await $`git cat-file -e ${sha}`.cwd(ctx.cwd).quiet().nothrow();
    if (exists.exitCode !== 0) {
      return { id: 2, label: "git blame SHAs reachable", status: "fail", detail: `unreachable SHA ${sha}` };
    }
  }
  return {
    id: 2,
    label: "git blame SHAs reachable",
    status: "pass",
    detail: `${uniqueShas.size} unique SHAs all reachable`,
  };
};

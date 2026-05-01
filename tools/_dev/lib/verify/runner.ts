import { check as c01 } from "./checks/01-history-follow.ts";
import { check as c02 } from "./checks/02-blame-reachable.ts";
import { check as c03 } from "./checks/03-pnpm-install.ts";
import { check as c04 } from "./checks/04-nx-graph.ts";
import { check as c05 } from "./checks/05-check-all.ts";
import { check as c06 } from "./checks/06-test-core.ts";
import { check as c07 } from "./checks/07-legacy-build.ts";
import { check as c08 } from "./checks/08-test-e2e.ts";
import { check as c09 } from "./checks/09-ci-draft.ts";
import { check as c10 } from "./checks/10-rebase-open-prs.ts";
import { check as c11 } from "./checks/11-release-smoke.ts";
import type { Check, CheckContext, CheckResult } from "./types.ts";

const ALL_CHECKS: Check[] = [c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11];

const isTTY = process.stdout.isTTY;
const wrap = (code: string, s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s: string) => wrap("32", s);
const red = (s: string) => wrap("31", s);
const yellow = (s: string) => wrap("33", s);
const dim = (s: string) => wrap("2", s);

export async function runVerification(ctx: CheckContext): Promise<{ results: CheckResult[]; failed: number }> {
  const results: CheckResult[] = [];
  for (const check of ALL_CHECKS) {
    process.stdout.write(`  · running check #${ALL_CHECKS.indexOf(check) + 1}…\r`);
    try {
      const result = await check(ctx);
      results.push(result);
      printResult(result);
    } catch (err) {
      const result: CheckResult = {
        id: ALL_CHECKS.indexOf(check) + 1,
        label: `check #${ALL_CHECKS.indexOf(check) + 1} (threw)`,
        status: "fail",
        detail: (err as Error).message,
      };
      results.push(result);
      printResult(result);
    }
  }
  const failed = results.filter((r) => r.status === "fail").length;
  printSummary(results, failed);
  return { results, failed };
}

function printResult(r: CheckResult): void {
  const id = String(r.id).padStart(2, " ");
  const label = r.label;
  const detail = r.detail ? dim(` — ${r.detail}`) : "";
  const status = {
    pass: green("PASS"),
    fail: red("FAIL"),
    manual: yellow("MANUAL"),
    skip: dim("SKIP"),
  }[r.status];
  process.stdout.write(`  ${status} ${id}. ${label}${detail}\n`);
}

function printSummary(results: CheckResult[], failed: number): void {
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  process.stdout.write(`\n  summary: ${summary}\n`);
  if (failed > 0) {
    process.stdout.write(`  ${red(`${failed} check(s) failed`)}\n`);
  } else {
    process.stdout.write(`  ${green("all required checks passed")}\n`);
  }
}

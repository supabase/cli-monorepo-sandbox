import { $ } from "bun";
import { extractFailureContext } from "../format.ts";
import type { Check } from "../types.ts";

export const check: Check = async (ctx) => {
  if (ctx.quick) {
    return { id: 8, label: "pnpm test:e2e green", status: "skip", detail: "--quick" };
  }
  const result = await $`pnpm test:e2e`.cwd(ctx.cwd).quiet().nothrow();
  if (result.exitCode !== 0) {
    const combined = `${result.stdout.toString()}\n${result.stderr.toString()}`;
    return { id: 8, label: "pnpm test:e2e green", status: "fail", detail: extractFailureContext(combined) };
  }
  return { id: 8, label: "pnpm test:e2e green", status: "pass" };
};

import { $ } from "bun";
import { extractFailureContext } from "../format.ts";
import type { Check } from "../types.ts";

export const check: Check = async (ctx) => {
  if (ctx.quick) {
    return { id: 5, label: "pnpm check:all green", status: "skip", detail: "--quick" };
  }
  const result = await $`pnpm check:all`.cwd(ctx.cwd).quiet().nothrow();
  if (result.exitCode !== 0) {
    const combined = `${result.stdout.toString()}\n${result.stderr.toString()}`;
    return { id: 5, label: "pnpm check:all green", status: "fail", detail: extractFailureContext(combined) };
  }
  return { id: 5, label: "pnpm check:all green", status: "pass" };
};

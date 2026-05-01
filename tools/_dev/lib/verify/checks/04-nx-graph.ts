import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import type { Check } from "../types.ts";

export const check: Check = async (ctx) => {
  if (ctx.quick) {
    return { id: 4, label: "nx graph shows cli-go", status: "skip", detail: "--quick" };
  }

  const nodeModules = join(ctx.cwd, "node_modules");
  if (!existsSync(nodeModules)) {
    return {
      id: 4,
      label: "nx graph shows cli-go",
      status: "skip",
      detail: "node_modules missing; run pnpm install first (or drop --quick)",
    };
  }

  const out = join(tmpdir(), `nx-graph-${process.pid}.json`);
  const result = await $`pnpm exec nx graph --file=${out}`.cwd(ctx.cwd).quiet().nothrow();
  if (result.exitCode !== 0) {
    return {
      id: 4,
      label: "nx graph shows cli-go",
      status: "fail",
      detail: result.stderr.toString().trim().split("\n").slice(-3).join(" / "),
    };
  }
  if (!existsSync(out)) {
    return { id: 4, label: "nx graph shows cli-go", status: "fail", detail: `nx did not write ${out}` };
  }

  const graph = JSON.parse(readFileSync(out, "utf8")) as {
    graph?: { nodes?: Record<string, unknown>; dependencies?: Record<string, Array<{ target: string; type: string }>> };
  };
  unlinkSync(out);

  const nodes = graph.graph?.nodes ?? {};
  const deps = graph.graph?.dependencies ?? {};

  if (!("cli-go" in nodes)) {
    return { id: 4, label: "nx graph shows cli-go", status: "fail", detail: "cli-go node missing" };
  }

  const dependsOnCliGo = (project: string) =>
    Array.isArray(deps[project]) && deps[project].some((d) => d.target === "cli-go");

  const e2eDeps = dependsOnCliGo("@supabase/cli-e2e");
  const cliDeps = dependsOnCliGo("@supabase/cli");

  if (!e2eDeps || !cliDeps) {
    return {
      id: 4,
      label: "nx graph shows cli-go",
      status: "fail",
      detail: `@supabase/cli-e2e->cli-go=${e2eDeps}, @supabase/cli->cli-go=${cliDeps}`,
    };
  }

  return { id: 4, label: "nx graph shows cli-go", status: "pass", detail: "cli-go + 2 dependents" };
};

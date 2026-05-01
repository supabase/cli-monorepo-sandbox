import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "../log.ts";
import type { RunContext } from "../types.ts";

const PLUGIN_REL_PATH = "tools/nx-plugins/src/go.plugin.ts";
const PLUGIN_REGISTRATION = `./${PLUGIN_REL_PATH}`;

const HERE = dirname(fileURLToPath(import.meta.url));

// Read the template eagerly at module load — by the time Phase 8 runs the
// dev directory may have moved as part of the consolidation, so resolve the
// template path while the original location is still authoritative.
const PLUGIN_TEMPLATE = readFileSync(
  join(HERE, "..", "..", "templates", "go.plugin.ts.tmpl"),
  "utf8",
);

export async function addNxGoPlugin(ctx: RunContext): Promise<void> {
  log.phase("Phase 8", "generate Nx Go inference plugin + wire deps");

  const pluginAbs = join(ctx.cwd, PLUGIN_REL_PATH);
  mkdirSync(dirname(pluginAbs), { recursive: true });
  writeFileSync(pluginAbs, PLUGIN_TEMPLATE);
  log.ok(`wrote ${PLUGIN_REL_PATH}`);

  patchNxJson(ctx);
  patchAppsPackageJson(ctx, "apps/cli-e2e/package.json", { addBuildDeps: ["test:e2e"] });
  patchAppsPackageJson(ctx, "apps/cli/package.json", { addBuildDeps: ["build"] });
}

function patchNxJson(ctx: RunContext): void {
  const abs = join(ctx.cwd, "nx.json");
  if (!existsSync(abs)) {
    log.warn("nx.json not present; skipping plugin registration");
    return;
  }
  const json = JSON.parse(readFileSync(abs, "utf8")) as { plugins?: unknown[] };
  json.plugins ??= [];
  if (json.plugins.includes(PLUGIN_REGISTRATION)) {
    log.info("nx.json already registers go.plugin.ts");
    return;
  }
  json.plugins.push(PLUGIN_REGISTRATION);
  writeFileSync(abs, `${JSON.stringify(json, null, 2)}\n`);
  log.ok(`registered ${PLUGIN_REGISTRATION} in nx.json`);
}

interface PatchOpts {
  addBuildDeps: string[]; // names of targets to add cli-go:build to dependsOn
}

interface NxTarget {
  dependsOn?: Array<string | { target?: string; projects?: string[] | string }>;
  inputs?: Array<unknown>;
  [k: string]: unknown;
}

interface NxBlock {
  implicitDependencies?: string[];
  targets?: Record<string, NxTarget>;
  [k: string]: unknown;
}

function patchAppsPackageJson(ctx: RunContext, rel: string, opts: PatchOpts): void {
  const abs = join(ctx.cwd, rel);
  if (!existsSync(abs)) {
    log.info(`skip ${rel} (not present)`);
    return;
  }

  const json = JSON.parse(readFileSync(abs, "utf8")) as { nx?: NxBlock };
  json.nx ??= {};
  json.nx.implicitDependencies ??= [];
  if (!json.nx.implicitDependencies.includes("cli-go")) {
    json.nx.implicitDependencies.push("cli-go");
  }

  json.nx.targets ??= {};
  for (const targetName of opts.addBuildDeps) {
    const target: NxTarget = json.nx.targets[targetName] ?? {};
    target.dependsOn ??= [];
    const hasBuildDep = target.dependsOn.some((d) =>
      typeof d === "string"
        ? d === "cli-go:build"
        : d?.target === "build" && (d.projects === "cli-go" || (Array.isArray(d.projects) && d.projects.includes("cli-go"))),
    );
    if (!hasBuildDep) {
      target.dependsOn.push({ projects: ["cli-go"], target: "build" });
    }
    json.nx.targets[targetName] = target;
  }

  writeFileSync(abs, `${JSON.stringify(json, null, 2)}\n`);
  log.ok(`patched ${rel} (implicitDependencies + dependsOn cli-go:build on ${opts.addBuildDeps.join(", ")})`);
}

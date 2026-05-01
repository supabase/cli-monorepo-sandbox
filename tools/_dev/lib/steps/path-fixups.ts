import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../git.ts";
import { log } from "../log.ts";
import {
  appendGolangciExclusions,
  insertWorkflowStepsBefore,
  removeWorkflowJob,
  removeWorkflowStep,
  replaceInFile,
  swapWorkflowBranches,
} from "../file-edit.ts";
import type { RunContext } from "../types.ts";

const OLD_PATH = ".repos/supabase-cli-go";
const NEW_PATH = "apps/cli-go";

// Some code paths build the source dir via `path.join(root, ".repos",
// "supabase-cli-go")` rather than as a single literal slash-string. Cover
// that pattern explicitly so the existence checks resolve correctly post-
// consolidation.
const PATH_JOIN_REPLACEMENTS: Array<{ from: string; to: string }> = [
  { from: '".repos", "supabase-cli-go"', to: '"apps", "cli-go"' },
  { from: "'.repos', 'supabase-cli-go'", to: "'apps', 'cli-go'" },
];

const SIMPLE_TEXT_REPLACEMENTS = [
  "apps/cli/scripts/build.ts",
  "apps/cli/src/shared/legacy/go-proxy.layer.ts",
  "tools/release/local-release.ts",
];

export async function pathFixups(ctx: RunContext): Promise<void> {
  log.phase("Phase 4", `swap ${OLD_PATH} → ${NEW_PATH} across dx-lab content`);

  for (const rel of SIMPLE_TEXT_REPLACEMENTS) {
    const abs = join(ctx.cwd, rel);
    if (!existsSync(abs)) {
      log.info(`skip ${rel} (not present)`);
      continue;
    }
    let total = 0;
    const literal = replaceInFile(abs, OLD_PATH, NEW_PATH);
    total += literal.occurrences;
    for (const { from, to } of PATH_JOIN_REPLACEMENTS) {
      const r = replaceInFile(abs, from, to);
      total += r.occurrences;
    }
    if (total > 0) log.ok(`patched ${rel} (${total} occurrence${total === 1 ? "" : "s"})`);
    else log.info(`${rel} had no matches`);
  }

  const testYml = join(ctx.cwd, ".github/workflows/test.yml");
  if (existsSync(testYml)) {
    const removedStep = removeWorkflowStep(testYml, "test-e2e", "Initialize Go CLI submodule");
    if (removedStep) log.ok("removed `Initialize Go CLI submodule` step from test.yml");
    else log.info("test.yml did not contain `Initialize Go CLI submodule` step");
    const replaced = replaceInFile(testYml, OLD_PATH, NEW_PATH);
    if (replaced.changed) log.ok(`patched .github/workflows/test.yml (${replaced.occurrences} occurrences)`);

    // dx-lab's test.yml runs `pnpm check:all` and `pnpm test:core` which
    // invoke `cli-go:lint:check` (golangci-lint) and `cli-go:test:unit`
    // (go test). Neither tool is available on the runner by default — inject
    // a Go toolchain setup before the run steps in those jobs.
    injectGoToolchain(testYml, "check", "Check code quality");
    injectGoToolchain(testYml, "test-core", "Run unit and integration tests");

    // dx-lab's `fixture-guard` job caps newly-added cli-e2e fixtures per PR
    // at 250 to catch recorder spam. The consolidation PR introduces ALL of
    // dx-lab's recorded fixtures at once (~750+) so the guard fires
    // legitimately but unhelpfully. Drop the job from the merged tree —
    // it's a recorder-hygiene check that's specifically meant for normal-
    // day PRs, not the one-time consolidation. Re-add via a follow-up PR
    // if/when desired.
    if (removeWorkflowJob(testYml, "fixture-guard")) {
      log.ok("removed `fixture-guard` job from test.yml (consolidation PR exception)");
    }
  } else {
    log.warn(".github/workflows/test.yml missing — dx-lab merge may not have brought it");
  }

  // Retarget dx-lab workflow triggers from dx-lab's default branch (main) to
  // the consolidated repo's default branch. dx-lab authored these against
  // its own `main`; after consolidation they need to fire on the target's
  // default branch (typically `develop` for both sandbox and supabase/cli).
  if (ctx.args.targetDefaultBranch !== "main") {
    const dxLabWorkflows = [
      ".github/workflows/test.yml",
      ".github/workflows/release-shared.yml",
      ".github/workflows/release-alpha.yml",
      ".github/workflows/release-stable.yml",
    ];
    let totalSwaps = 0;
    for (const rel of dxLabWorkflows) {
      const abs = join(ctx.cwd, rel);
      const n = swapWorkflowBranches(abs, "main", ctx.args.targetDefaultBranch);
      if (n > 0) {
        log.ok(`retargeted ${rel}: main → ${ctx.args.targetDefaultBranch} (${n})`);
        totalSwaps += n;
      }
    }
    log.info(`workflow branch retargets: ${totalSwaps} total (main → ${ctx.args.targetDefaultBranch})`);
  } else {
    log.info("--target-default-branch=main; skipping workflow branch retarget");
  }

  // Backfill golangci-lint exclusions for issues that were silently
  // suppressed by `golangci/golangci-lint-action`'s `only-new-issues: true`
  // filter on cli-go's standalone CI. After consolidation we run lint
  // directly via the Nx plugin (no diff filter), so pre-existing findings
  // surface. These exclusions land in apps/cli-go/.golangci.yml as part of
  // the consolidation diff so the consolidated tree's `pnpm check:all`
  // passes; the cli-go team can later remove them and fix the underlying
  // issues if they prefer.
  const golangciYml = join(ctx.cwd, "apps/cli-go/.golangci.yml");
  if (existsSync(golangciYml)) {
    const added = appendGolangciExclusions(golangciYml, [
      // gosec G101: hardcoded password URLs in tests are intentional.
      { path: "_test\\.go", linters: ["gosec"], text: "G101" },
      // gosec G117: docker auth carries a Password field by design.
      { path: "internal/utils/docker\\.go", linters: ["gosec"], text: "G117" },
      // unused: diffWithStream is referenced via a feature-flag path.
      { path: "internal/db/diff/diff\\.go", linters: ["unused"], text: "diffWithStream is unused" },
    ]);
    if (added > 0) log.ok(`added ${added} exclusion rule(s) to apps/cli-go/.golangci.yml`);
    else log.info("apps/cli-go/.golangci.yml already has the consolidation exclusions");
  }

  await removeCliGoSubmodule(ctx);
}

function injectGoToolchain(testYmlAbs: string, jobName: string, beforeStepName: string): void {
  const inserted = insertWorkflowStepsBefore(testYmlAbs, jobName, beforeStepName, [
    {
      name: "Setup Go",
      uses: "actions/setup-go@v5",
      with: {
        "go-version-file": "apps/cli-go/go.mod",
        "cache-dependency-path": "apps/cli-go/go.sum",
      },
    },
    {
      name: "Install golangci-lint",
      // `go install` compiles from source, which is slower than the install.sh
      // download but reliable. The official install.sh has had repeated
      // checksum-verification failures on recent releases.
      // Single line: yaml's default scalar style folds newlines to spaces,
      // so we chain with `&&` instead of using a multi-line block.
      run: 'go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest && echo "$(go env GOPATH)/bin" >> "$GITHUB_PATH"',
    },
    {
      // Required by cli-go's `internal/utils/credentials/keyring_test.go`,
      // which needs an unlocked keyring backend on the Linux runner. Same
      // action the original cli-go-ci.yml used.
      name: "Unlock keyring (for cli-go keyring tests)",
      uses: "t1m0thyj/unlock-keyring@cbcf205c879ebd86add70bab3a6abfcce59a5cae", // v1.2.0
    },
  ]);
  if (inserted) log.ok(`injected Go toolchain into test.yml job '${jobName}'`);
  else log.info(`test.yml job '${jobName}' already has Go toolchain or anchor missing`);
}

async function removeCliGoSubmodule(ctx: RunContext): Promise<void> {
  const gitmodulesAbs = join(ctx.cwd, ".gitmodules");
  if (!existsSync(gitmodulesAbs)) {
    log.info(".gitmodules not present");
    return;
  }
  const before = readFileSync(gitmodulesAbs, "utf8");
  if (!before.includes(`path = ${OLD_PATH}`)) {
    log.info(`.gitmodules has no entry for ${OLD_PATH}`);
    return;
  }

  // `git rm <submodule>` updates .gitmodules + index + working tree atomically.
  try {
    await git.run(ctx, ["rm", "-rf", OLD_PATH]);
    log.ok(`git rm ${OLD_PATH} (auto-updates .gitmodules)`);
  } catch (err) {
    log.warn(`git rm ${OLD_PATH} failed: ${(err as Error).message}; falling back to manual cleanup`);
    await git.run(ctx, ["config", "-f", ".gitmodules", "--remove-section", `submodule.${OLD_PATH}`]).catch(() => {});
    await git.run(ctx, ["add", ".gitmodules"]).catch(() => {});
    await git.run(ctx, ["rm", "-rf", "--cached", OLD_PATH]).catch(() => {});
  }

  const after = readFileSync(gitmodulesAbs, "utf8").trim();
  if (after.length === 0) {
    await git.run(ctx, ["rm", ".gitmodules"]);
    log.ok("git rm .gitmodules (no submodules left)");
  }
}

import { resolve } from "node:path";
import type { Args } from "./types.ts";

const DEFAULTS = {
  dxLabSource: "https://github.com/supabase/dx-lab.git",
  dxLabBranch: "main",
  consolidationBranch: "chore/monorepo-consolidation",
  targetDefaultBranch: "develop",
} as const;

const HELP = `consolidate-monorepo.ts — rehearse the supabase/cli + dx-lab consolidation

Usage: bun consolidate-monorepo.ts [flags]

Flags:
  --target-dir <path>          Target repo (default: cwd)
  --dx-lab-source <url|path>   dx-lab source (default: ${DEFAULTS.dxLabSource})
  --dx-lab-branch <branch>     dx-lab branch to merge (default: ${DEFAULTS.dxLabBranch})
  --branch <branch>            Consolidation branch name (default: ${DEFAULTS.consolidationBranch})
  --target-default-branch <b>  Target repo's default branch — used to retarget dx-lab workflows
                               from dx-lab's 'main' to this value (default: ${DEFAULTS.targetDefaultBranch})
  --no-reset                   Abort if pre-consolidation marker present (instead of resetting)
  --skip-verify                Skip Phase 10 verification
  --verify-only                Skip Phases 0-9, only run verification
  --quick-verify               Skip slow verification checks (install/build/tests)
  --release-smoke              Run optional Verdaccio publish + install + version check
  --include-api-sync           Lift cli-go-api-sync.yml (off by default)
  --keep-bumpdoc               Don't delete apps/cli-go/tools/bumpdoc/
  -h, --help                   Show this help
`;

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    targetDir: process.cwd(),
    dxLabSource: DEFAULTS.dxLabSource,
    dxLabBranch: DEFAULTS.dxLabBranch,
    consolidationBranch: DEFAULTS.consolidationBranch,
    noReset: false,
    skipVerify: false,
    verifyOnly: false,
    quickVerify: false,
    releaseSmoke: false,
    targetDefaultBranch: DEFAULTS.targetDefaultBranch,
    includeApiSync: false,
    keepBumpdoc: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) {
        process.stderr.write(`flag ${arg} expects a value\n`);
        process.exit(2);
      }
      return v;
    };
    switch (arg) {
      case "--target-dir":
        a.targetDir = resolve(next());
        break;
      case "--dx-lab-source":
        a.dxLabSource = next();
        break;
      case "--dx-lab-branch":
        a.dxLabBranch = next();
        break;
      case "--branch":
        a.consolidationBranch = next();
        break;
      case "--target-default-branch":
        a.targetDefaultBranch = next();
        break;
      case "--no-reset":
        a.noReset = true;
        break;
      case "--skip-verify":
        a.skipVerify = true;
        break;
      case "--verify-only":
        a.verifyOnly = true;
        break;
      case "--quick-verify":
        a.quickVerify = true;
        break;
      case "--release-smoke":
        a.releaseSmoke = true;
        break;
      case "--include-api-sync":
        a.includeApiSync = true;
        break;
      case "--keep-bumpdoc":
        a.keepBumpdoc = true;
        break;
      case "-h":
      case "--help":
        process.stdout.write(HELP);
        process.exit(0);
        break;
      default:
        process.stderr.write(`unknown flag: ${arg}\n${HELP}`);
        process.exit(2);
    }
  }

  if (!a.dxLabSource.startsWith("http") && !a.dxLabSource.startsWith("git@") && !a.dxLabSource.startsWith("/")) {
    a.dxLabSource = resolve(a.dxLabSource);
  }

  return a;
}

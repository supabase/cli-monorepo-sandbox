#!/usr/bin/env bun
import { resolve } from "node:path";
import { log } from "./lib/log.ts";
import { runVerification } from "./lib/verify/runner.ts";

interface VerifyArgs {
  cwd: string;
  quick: boolean;
  releaseSmoke: boolean;
}

function parseArgs(argv: string[]): VerifyArgs {
  const a: VerifyArgs = { cwd: process.cwd(), quick: false, releaseSmoke: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--target-dir":
        a.cwd = resolve(argv[++i] ?? process.cwd());
        break;
      case "--quick":
        a.quick = true;
        break;
      case "--release-smoke":
        a.releaseSmoke = true;
        break;
      case "-h":
      case "--help":
        process.stdout.write(
          `verify-consolidation\n\nFlags:\n  --target-dir <path>   target repo (default: cwd)\n  --quick               skip slow checks (install, build, tests)\n  --release-smoke       run the optional Verdaccio release smoke check\n  -h, --help            this help\n`,
        );
        process.exit(0);
        break;
      default:
        process.stderr.write(`unknown flag: ${arg}\n`);
        process.exit(2);
    }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));

log.banner(
  "verify-consolidation",
  `target=${args.cwd}${args.quick ? " (quick mode)" : ""}${args.releaseSmoke ? " (+release-smoke)" : ""}`,
);
const { failed } = await runVerification({
  cwd: args.cwd,
  quick: args.quick,
  releaseSmoke: args.releaseSmoke,
});
process.exit(failed > 0 ? 1 : 0);

import { existsSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import type { Check } from "../types.ts";
import { extractFailureContext } from "../format.ts";

const REGISTRY = "http://localhost:4873";

async function isRegistryUp(): Promise<boolean> {
  try {
    const res = await fetch(`${REGISTRY}/-/ping`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForRegistryReady(cwd: string, maxAttempts = 120, intervalMs = 500): Promise<boolean> {
  // Wait until both ping is OK *and* the auth token file exists. The token
  // is written after createUser in local-registry.ts, which races with
  // verdaccio's first response to /-/ping.
  const tokenPath = join(cwd, "tmp", "verdaccio-token");
  for (let i = 0; i < maxAttempts; i++) {
    if ((await isRegistryUp()) && existsSync(tokenPath)) return true;
    await Bun.sleep(intervalMs);
  }
  return false;
}

export const check: Check = async (ctx) => {
  if (!ctx.releaseSmoke) {
    return { id: 11, label: "verdaccio release smoke", status: "skip", detail: "--release-smoke not passed" };
  }

  // pnpm cli-release uses workspace tooling; node_modules must be installed.
  if (!existsSync(join(ctx.cwd, "node_modules"))) {
    return {
      id: 11,
      label: "verdaccio release smoke",
      status: "skip",
      detail: "node_modules missing; run pnpm install first (or drop --quick from a full run)",
    };
  }

  const tokenPath = join(ctx.cwd, "tmp", "verdaccio-token");
  const alreadyRunning = await isRegistryUp();
  let registryProc: ReturnType<typeof Bun.spawn> | null = null;

  try {
    if (alreadyRunning && !existsSync(tokenPath)) {
      return {
        id: 11,
        label: "verdaccio release smoke",
        status: "fail",
        detail: `verdaccio is up at ${REGISTRY} but ${tokenPath} is missing — kill the stale process (pkill -f verdaccio) and re-run`,
      };
    }

    if (!alreadyRunning) {
      registryProc = Bun.spawn(["pnpm", "local-registry"], {
        cwd: ctx.cwd,
        // Discard output so the registry process doesn't block on a full
        // pipe buffer (we don't drain stdout/stderr ourselves).
        stdout: "ignore",
        stderr: "ignore",
      });
      const ready = await waitForRegistryReady(ctx.cwd);
      if (!ready) {
        return {
          id: 11,
          label: "verdaccio release smoke",
          status: "fail",
          detail: `verdaccio + auth token did not become ready within 60s on ${REGISTRY}`,
        };
      }
    }

    const version = `0.0.0-local.${Date.now()}`;
    const releaseResult = await $`pnpm cli-release --legacy --version ${version}`
      .cwd(ctx.cwd)
      .quiet()
      .nothrow();
    if (releaseResult.exitCode !== 0) {
      const combined = `${releaseResult.stdout.toString()}\n${releaseResult.stderr.toString()}`;
      return { id: 11, label: "verdaccio release smoke", status: "fail", detail: `release failed: ${extractFailureContext(combined)}` };
    }

    const versionResult = await $`npx --yes --registry ${REGISTRY} @supabase/cli@${version} --version`
      .cwd(ctx.cwd)
      .quiet()
      .nothrow();
    if (versionResult.exitCode !== 0) {
      const combined = `${versionResult.stdout.toString()}\n${versionResult.stderr.toString()}`;
      return { id: 11, label: "verdaccio release smoke", status: "fail", detail: `npx invocation failed: ${extractFailureContext(combined)}` };
    }

    const output = versionResult.stdout.toString().trim();
    // The legacy shell embeds `v0.0.0-dev` at build time and doesn't pick up
    // the npm package version, so we don't assert on the version string —
    // we just confirm the binary ran and printed something version-shaped.
    if (!/v?\d/.test(output)) {
      return {
        id: 11,
        label: "verdaccio release smoke",
        status: "fail",
        detail: `published @${version} but \`supabase --version\` returned non-version output: ${output.slice(0, 120)}`,
      };
    }

    return {
      id: 11,
      label: "verdaccio release smoke",
      status: "pass",
      detail: `published @${version}, installed, ran (${output.slice(0, 60)})`,
    };
  } finally {
    if (registryProc) {
      registryProc.kill();
      await registryProc.exited.catch(() => {});
    }
  }
};

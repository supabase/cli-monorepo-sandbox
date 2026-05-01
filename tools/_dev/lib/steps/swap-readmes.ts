import { existsSync } from "node:fs";
import { join } from "node:path";
import { git } from "../git.ts";
import { log } from "../log.ts";
import type { RunContext } from "../types.ts";

const ROOT_README = "README.md";
const ROOT_CONTRIBUTING = "CONTRIBUTING.md";
const CLI_GO_README = "apps/cli-go/README.md";

/**
 * After the merge:
 *   - root `README.md` = dx-lab's monorepo onboarding (developer-facing)
 *   - `apps/cli-go/README.md` = user-facing `supabase` CLI README
 *
 * The user-facing README belongs at root (it's what npm/GitHub render). The
 * dx-lab onboarding belongs in `CONTRIBUTING.md` (it's contributor docs).
 *
 * This step:
 *   1. Refuses to clobber an existing root `CONTRIBUTING.md` (sanity guard).
 *   2. `git mv README.md CONTRIBUTING.md` — dx-lab onboarding becomes the
 *      contributor doc.
 *   3. `git mv apps/cli-go/README.md README.md` — Go CLI README takes the
 *      canonical root slot.
 */
export async function swapReadmes(ctx: RunContext): Promise<void> {
  log.phase("Phase 6", "swap dx-lab README → CONTRIBUTING, lift cli-go README to root");

  const rootReadmeAbs = join(ctx.cwd, ROOT_README);
  const rootContributingAbs = join(ctx.cwd, ROOT_CONTRIBUTING);
  const cliGoReadmeAbs = join(ctx.cwd, CLI_GO_README);

  if (!existsSync(rootReadmeAbs)) {
    log.warn(`${ROOT_README} not present at root; skipping swap`);
    return;
  }
  if (!existsSync(cliGoReadmeAbs)) {
    log.warn(`${CLI_GO_README} not present; skipping swap`);
    return;
  }
  if (existsSync(rootContributingAbs)) {
    throw new Error(
      `${ROOT_CONTRIBUTING} already exists at root — refusing to clobber. ` +
        `Resolve manually before re-running, or extend swap-readmes.ts to handle the collision.`,
    );
  }

  await git.run(ctx, ["mv", ROOT_README, ROOT_CONTRIBUTING]);
  log.ok(`git mv ${ROOT_README} → ${ROOT_CONTRIBUTING}`);

  await git.run(ctx, ["mv", CLI_GO_README, ROOT_README]);
  log.ok(`git mv ${CLI_GO_README} → ${ROOT_README}`);
}

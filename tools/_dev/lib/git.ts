import { $ } from "bun";

export type GitContext = { cwd: string };

async function capture(ctx: GitContext, args: string[]): Promise<string> {
  const result = await $`git ${args}`.cwd(ctx.cwd).quiet().nothrow();
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trimEnd();
    throw new Error(`git ${args.join(" ")} failed (${result.exitCode}): ${stderr}`);
  }
  return result.stdout.toString().trimEnd();
}

async function run(ctx: GitContext, args: string[]): Promise<void> {
  const result = await $`git ${args}`.cwd(ctx.cwd).quiet().nothrow();
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trimEnd();
    throw new Error(`git ${args.join(" ")} failed (${result.exitCode}): ${stderr}`);
  }
}

export const git = {
  async run(ctx: GitContext, args: string[]): Promise<void> {
    await run(ctx, args);
  },
  async insideWorkTree(ctx: GitContext): Promise<boolean> {
    try {
      const out = await capture(ctx, ["rev-parse", "--is-inside-work-tree"]);
      return out === "true";
    } catch {
      return false;
    }
  },
  async toplevel(ctx: GitContext): Promise<string> {
    return capture(ctx, ["rev-parse", "--show-toplevel"]);
  },
  async currentBranch(ctx: GitContext): Promise<string> {
    return capture(ctx, ["symbolic-ref", "--short", "HEAD"]);
  },
  async headSha(ctx: GitContext): Promise<string> {
    return capture(ctx, ["rev-parse", "HEAD"]);
  },
  async isClean(ctx: GitContext): Promise<boolean> {
    const out = await capture(ctx, ["status", "--porcelain"]);
    return out.length === 0;
  },
  async tagExists(ctx: GitContext, name: string): Promise<boolean> {
    try {
      await capture(ctx, ["rev-parse", "--verify", `refs/tags/${name}`]);
      return true;
    } catch {
      return false;
    }
  },
  async branchExists(ctx: GitContext, name: string): Promise<boolean> {
    try {
      await capture(ctx, ["rev-parse", "--verify", `refs/heads/${name}`]);
      return true;
    } catch {
      return false;
    }
  },
  async remoteExists(ctx: GitContext, name: string): Promise<boolean> {
    const out = await capture(ctx, ["remote"]);
    return out.split("\n").map((s) => s.trim()).filter(Boolean).includes(name);
  },
  async addAnnotatedTag(
    ctx: GitContext,
    name: string,
    sha: string,
    message: string,
    force = false,
  ): Promise<void> {
    const flag = force ? "-fa" : "-a";
    await run(ctx, ["tag", flag, name, sha, "-m", message]);
  },
  async readTagMessage(ctx: GitContext, name: string): Promise<string> {
    return capture(ctx, [
      "for-each-ref",
      "--format=%(contents)",
      `refs/tags/${name}`,
    ]);
  },
  async deleteTag(ctx: GitContext, name: string): Promise<void> {
    await run(ctx, ["tag", "-d", name]);
  },
  async deleteBranch(ctx: GitContext, name: string, force = true): Promise<void> {
    await run(ctx, ["branch", force ? "-D" : "-d", name]);
  },
  async checkout(ctx: GitContext, ref: string): Promise<void> {
    await run(ctx, ["checkout", ref]);
  },
  async createBranch(ctx: GitContext, name: string): Promise<void> {
    await run(ctx, ["checkout", "-b", name]);
  },
  async resetHard(ctx: GitContext, ref: string): Promise<void> {
    await run(ctx, ["reset", "--hard", ref]);
  },
  async addRemote(ctx: GitContext, name: string, url: string): Promise<void> {
    await run(ctx, ["remote", "add", name, url]);
  },
  async removeRemote(ctx: GitContext, name: string): Promise<void> {
    await run(ctx, ["remote", "remove", name]);
  },
  async fetch(ctx: GitContext, remote: string, args: string[] = []): Promise<void> {
    await run(ctx, ["fetch", remote, ...args]);
  },
  async mv(ctx: GitContext, from: string, to: string): Promise<void> {
    await run(ctx, ["mv", from, to]);
  },
  async commit(ctx: GitContext, message: string, args: string[] = []): Promise<void> {
    await run(ctx, ["commit", ...args, "-m", message]);
  },
  async commitAll(ctx: GitContext, message: string): Promise<void> {
    await run(ctx, ["add", "-A"]);
    await run(ctx, ["commit", "-m", message]);
  },
  async merge(
    ctx: GitContext,
    ref: string,
    args: string[] = [],
  ): Promise<{ ok: true } | { ok: false; conflicts: string[] }> {
    try {
      await run(ctx, ["merge", ...args, ref]);
      return { ok: true };
    } catch {
      const status = await capture(ctx, ["status", "--porcelain"]).catch(() => "");
      const conflicts = status
        .split("\n")
        .filter((line) => /^(UU|AA|DD|AU|UA|DU|UD)/.test(line))
        .map((line) => line.slice(3));
      return { ok: false, conflicts };
    }
  },
  async abortMerge(ctx: GitContext): Promise<void> {
    await run(ctx, ["merge", "--abort"]).catch(() => {});
  },
  async listTopLevelEntries(ctx: GitContext): Promise<string[]> {
    const out = await capture(ctx, ["ls-tree", "--name-only", "HEAD"]);
    return out.split("\n").filter(Boolean);
  },
  async logCount(ctx: GitContext, args: string[]): Promise<number> {
    const out = await capture(ctx, ["log", "--oneline", ...args]);
    return out.split("\n").filter(Boolean).length;
  },
  async commitExists(ctx: GitContext, sha: string): Promise<boolean> {
    try {
      await capture(ctx, ["cat-file", "-e", sha]);
      return true;
    } catch {
      return false;
    }
  },
};

const isTTY = process.stdout.isTTY;
const wrap = (code: string, s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);

const dim = (s: string) => wrap("2", s);
const bold = (s: string) => wrap("1", s);
const red = (s: string) => wrap("31", s);
const green = (s: string) => wrap("32", s);
const yellow = (s: string) => wrap("33", s);
const blue = (s: string) => wrap("34", s);
const cyan = (s: string) => wrap("36", s);

let currentPhase: string | null = null;

export const log = {
  phase(name: string, description: string): void {
    currentPhase = name;
    process.stdout.write(`\n${bold(blue(`▸ ${name}`))} ${dim(description)}\n`);
  },
  step(message: string): void {
    process.stdout.write(`  ${dim("·")} ${message}\n`);
  },
  info(message: string): void {
    process.stdout.write(`  ${cyan("i")} ${message}\n`);
  },
  ok(message: string): void {
    process.stdout.write(`  ${green("✓")} ${message}\n`);
  },
  warn(message: string): void {
    process.stdout.write(`  ${yellow("⚠")} ${message}\n`);
  },
  error(message: string): void {
    process.stderr.write(`  ${red("✗")} ${message}\n`);
  },
  fatal(message: string): void {
    process.stderr.write(`\n${bold(red("FATAL"))} ${message}\n`);
  },
  rollback(message: string): void {
    process.stderr.write(`  ${yellow("↺")} ${message}\n`);
  },
  banner(title: string, subtitle?: string): void {
    process.stdout.write(`\n${bold(`━━ ${title} ━━`)}\n`);
    if (subtitle) process.stdout.write(`${dim(subtitle)}\n`);
  },
  currentPhase(): string | null {
    return currentPhase;
  },
};

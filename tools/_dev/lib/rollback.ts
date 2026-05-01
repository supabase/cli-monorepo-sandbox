import { log } from "./log.ts";

export type UndoFn = () => Promise<void> | void;

export interface Rollback {
  push(label: string, fn: UndoFn): void;
  replay(): Promise<void>;
  clear(): void;
  size(): number;
}

export function createRollback(): Rollback {
  const stack: Array<{ label: string; fn: UndoFn }> = [];
  return {
    push(label, fn) {
      stack.push({ label, fn });
    },
    async replay() {
      while (stack.length > 0) {
        const { label, fn } = stack.pop()!;
        try {
          log.rollback(label);
          await fn();
        } catch (err) {
          log.warn(`rollback step failed: ${label} — ${(err as Error).message}`);
        }
      }
    },
    clear() {
      stack.length = 0;
    },
    size() {
      return stack.length;
    },
  };
}

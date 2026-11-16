export class LockoutPolicy {
  constructor(
    private readonly maxAttempts: number,
    private readonly lockDurationMs: number,
  ) {}

  shouldLock(failedAttempts: number): boolean {
    return failedAttempts >= this.maxAttempts;
  }

  lockedUntil(now: Date): Date {
    return new Date(now.getTime() + this.lockDurationMs);
  }
}

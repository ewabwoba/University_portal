export const CLOCK = Symbol('CLOCK');

/** Abstracts time so rules (windows, expiry, lockouts) are deterministic in tests. */
export interface Clock {
  now(): Date;
}

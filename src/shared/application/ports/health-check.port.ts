export const HEALTH_CHECK = Symbol('HEALTH_CHECK');

export interface HealthCheck {
  readonly name: string;
  /** Resolves when healthy, rejects when not. */
  check(): Promise<void>;
}

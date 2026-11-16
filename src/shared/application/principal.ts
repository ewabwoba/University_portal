/** The authenticated caller, as resolved on every request (never trusted from the token alone). */
export interface Principal {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly permissions: ReadonlySet<string>;
}

export const hasAllPermissions = (
  principal: Principal,
  required: readonly string[],
): boolean =>
  required.every((permission) => principal.permissions.has(permission));

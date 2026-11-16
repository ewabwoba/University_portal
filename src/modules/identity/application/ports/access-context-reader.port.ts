export const ACCESS_CONTEXT_READER = Symbol('ACCESS_CONTEXT_READER');

export interface AccessContext {
  id: string;
  email: string;
  isActive: boolean;
  passwordChangedAt: Date | null;
  roles: string[];
  permissions: string[];
}

/** Reads the caller's CURRENT roles and permissions, so changes and deactivation apply instantly. */
export interface AccessContextReader {
  load(userId: string): Promise<AccessContext | null>;
}

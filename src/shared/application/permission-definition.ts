/** A permission a module contributes to the catalog (synced into the database by `npm run seed`). */
export interface PermissionDefinition {
  /** Format: `module:resource:action`, e.g. `finance:invoice:create`. */
  name: string;
  module: string;
  description: string;
}

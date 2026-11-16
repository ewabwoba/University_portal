/**
 * A tiny dependency-free validation toolkit for policy values. Policies are stored as JSON and edited
 * by administrators, so every value is validated against a strict shape: wrong types, out-of-range
 * numbers and unknown fields are all rejected, and every problem is reported with its path.
 */
export type Issues = string[];
export type Parser<T> = (
  value: unknown,
  path: string,
  issues: Issues,
) => T | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const bool = (): Parser<boolean> => (value, path, issues) => {
  if (typeof value === 'boolean') return value;
  issues.push(`${path}: must be true or false`);
  return undefined;
};

export const num =
  (
    range: { min?: number; max?: number; integer?: boolean } = {},
  ): Parser<number> =>
  (value, path, issues) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push(`${path}: must be a number`);
      return undefined;
    }
    if (range.integer && !Number.isInteger(value))
      issues.push(`${path}: must be a whole number`);
    if (range.min !== undefined && value < range.min)
      issues.push(`${path}: must be at least ${range.min}`);
    if (range.max !== undefined && value > range.max)
      issues.push(`${path}: must be at most ${range.max}`);
    return value;
  };

const NAME_MAX_LENGTH = 64;
export const text = (): Parser<string> => (value, path, issues) => {
  if (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= NAME_MAX_LENGTH
  )
    return value.trim();
  issues.push(
    `${path}: must be a non-empty string of at most ${NAME_MAX_LENGTH} characters`,
  );
  return undefined;
};

export const oneOf =
  <const T extends readonly string[]>(allowed: T): Parser<T[number]> =>
  (value, path, issues) => {
    if (
      typeof value === 'string' &&
      (allowed as readonly string[]).includes(value)
    )
      return value as T[number];
    issues.push(`${path}: must be one of ${allowed.join(', ')}`);
    return undefined;
  };

export const nullable =
  <T>(inner: Parser<T>): Parser<T | null> =>
  (value, path, issues) =>
    value === null ? null : inner(value, path, issues);

export const list =
  <T>(item: Parser<T>, size: { min?: number; max: number }): Parser<T[]> =>
  (value, path, issues) => {
    if (!Array.isArray(value)) {
      issues.push(`${path}: must be a list`);
      return undefined;
    }
    if (value.length < (size.min ?? 0))
      issues.push(`${path}: needs at least ${size.min} item(s)`);
    if (value.length > size.max)
      issues.push(`${path}: may have at most ${size.max} items`);
    const parsed = value
      .slice(0, size.max)
      .map((entry, i) => item(entry, `${path}[${i}]`, issues));
    return parsed.every((entry) => entry !== undefined)
      ? (parsed as T[])
      : undefined;
  };

/** A strict object: every declared field is required, and undeclared fields are an error. */
export const shape =
  <T extends object>(fields: { [K in keyof T]-?: Parser<T[K]> }): Parser<T> =>
  (value, path, issues) => {
    if (!isRecord(value)) {
      issues.push(`${path}: must be an object`);
      return undefined;
    }
    const known = new Set(Object.keys(fields));
    for (const key of Object.keys(value))
      if (!known.has(key)) issues.push(`${path}.${key}: unknown field`);

    const result: Record<string, unknown> = {};
    let complete = true;
    for (const [key, parse] of Object.entries(fields) as [
      string,
      Parser<unknown>,
    ][]) {
      if (!(key in value)) {
        issues.push(`${path}.${key}: is required`);
        complete = false;
        continue;
      }
      const parsed = parse(value[key], `${path}.${key}`, issues);
      if (parsed === undefined) complete = false;
      else result[key] = parsed;
    }
    return complete ? (result as T) : undefined;
  };

/** Chooses a parser from the value of a discriminating field (`mode`, `type`, ...). */
export const variants =
  <T>(field: string, byTag: Record<string, Parser<T>>): Parser<T> =>
  (value, path, issues) => {
    if (!isRecord(value)) {
      issues.push(`${path}: must be an object`);
      return undefined;
    }
    const tag = value[field];
    const parser = typeof tag === 'string' ? byTag[tag] : undefined;
    if (!parser) {
      issues.push(
        `${path}.${field}: must be one of ${Object.keys(byTag).join(', ')}`,
      );
      return undefined;
    }
    return parser(value, path, issues);
  };

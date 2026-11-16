export interface PageQuery {
  page?: number;
  limit?: number;
}

export interface PageSettings {
  defaultLimit: number;
  maxLimit: number;
}

export interface PageRequest {
  page: number;
  limit: number;
  skip: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Applies defaults and clamps `limit` to the configured maximum. */
export function resolvePage(
  query: PageQuery,
  settings: PageSettings,
): PageRequest {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(
    Math.max(1, query.limit ?? settings.defaultLimit),
    settings.maxLimit,
  );
  return { page, limit, skip: (page - 1) * limit };
}

export function toPaginated<T>(
  items: T[],
  total: number,
  request: PageRequest,
): Paginated<T> {
  return {
    items,
    page: request.page,
    limit: request.limit,
    total,
    totalPages: Math.ceil(total / request.limit),
  };
}

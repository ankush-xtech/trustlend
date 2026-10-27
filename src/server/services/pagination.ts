export interface PageParams {
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function pageArgs(p: PageParams, maxPageSize = 100) {
  const pageSize = Math.min(Math.max(Math.trunc(p.pageSize ?? 20), 1), maxPageSize);
  const page = Math.max(Math.trunc(p.page ?? 1), 1);
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

export function paged<T>(rows: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Escape LIKE wildcards in user search input. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

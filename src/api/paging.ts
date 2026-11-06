// The paged-list pattern every iOS sync uses (getAllX → getAllXByPage →
// getAllXByPageAPI): request page 1, then keep following `paging.next`.

/** Safety stop: never follow more pages than this. */
const MAX_PAGES = 50;

export type Page<T> = {
  items: T[];
  /** The next page number, or ≤ 0 / -1 when there are no more. */
  next: number;
};

/**
 * Fetches every page and returns all items. If any page fails the whole
 * call fails, so callers never store a partial list.
 */
export async function fetchAllPages<T>(fetchPage: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { items, next } = await fetchPage(page);
    all.push(...items);
    // Stop when there is no next page, or it would not move forward.
    if (!(next > page)) {
      break;
    }
    page = next;
  }
  return all;
}

/** An integer field: decimals are truncated, as ObjectMapper does for an Int. */
export const toInt = (value: unknown): number => {
  const n = typeof value === 'number' ? Math.trunc(value) : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** A decimal field (a Double in iOS). */
export const toNumber = (value: unknown): number => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export const toStr = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

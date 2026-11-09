import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGamesPage, type GameTab } from '../api/games';
import type { Game } from '../api/types';
import { readGameList, writeGameListPage } from '../db/repositories';

// One games list (GamesViewController.syncGames / loadNewGames_APICall in
// iOS): the cached list shows at once, page 1 is fetched, more pages load on
// scroll. Answers for a list that is no longer on screen (another tab, team
// or org, or the screen has closed, e.g. after logout) change nothing.

export type GameListParams = {
  userId: number;
  orgId: number;
  isHomeUser: boolean;
  teamId: number;
  /** 2 = teamId is an opponent team (see GamesQuery). */
  teamType?: 1 | 2;
  tab: GameTab;
};

export type GameListState = {
  games: Game[];
  /** True until the first answer (cached or server) for this list. */
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refresh: () => void;
  loadMore: () => void;
};

/**
 * The cache key of one list. An opponent's list is kept apart from the team
 * with the same id ("o" before the id); My Team keys are unchanged.
 */
export const gameListKey = (p: GameListParams) =>
  `${p.userId}:${p.orgId}:${p.teamType === 2 ? `o${p.teamId}` : p.teamId}:${p.tab}`;

const message = (e: unknown) => (e instanceof Error ? e.message : 'Unable to load games.');

export function useGameList(params: GameListParams | null): GameListState {
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const key = params ? gameListKey(params) : null;
  // The list currently on screen; answers for any other key are dropped.
  const activeKey = useRef<string | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const loadingMore = useRef(false);
  // Bumped by every refresh. A page loaded for an older refresh is dropped,
  // so a list can never become page 1 + page 3 (page 2 missing).
  const refreshGen = useRef(0);
  const refreshing = useRef(false);

  const showCache = (k: string) => {
    const cached = readGameList(k);
    if (cached) {
      setGames(cached.games);
      setNextPage(cached.nextPage);
      setIsLoading(false);
    }
    return cached;
  };

  const fetchPage = useCallback(async (page: number, gen: number) => {
    const p = paramsRef.current;
    if (!p) {
      return;
    }
    const k = gameListKey(p);
    const result = await fetchGamesPage({ ...p, page });
    if (activeKey.current !== k) {
      return; // another list is on screen now, or the screen has closed
    }
    if (gen !== refreshGen.current) {
      return; // a newer refresh has replaced the list since this was asked for
    }
    writeGameListPage(k, page, result.games, result.next);
    showCache(k);
    setError(null);
  }, []);

  const refresh = useCallback(() => {
    const k = activeKey.current;
    if (!k) {
      return;
    }
    const gen = ++refreshGen.current;
    refreshing.current = true;
    setIsRefreshing(true);
    fetchPage(1, gen)
      .catch(e => {
        if (activeKey.current === k && gen === refreshGen.current) {
          setError(message(e));
        }
      })
      .finally(() => {
        if (gen === refreshGen.current) {
          refreshing.current = false;
        }
        if (activeKey.current === k && gen === refreshGen.current) {
          setIsRefreshing(false);
          setIsLoading(false);
        }
      });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    const k = activeKey.current;
    // Not while page 1 is being refreshed: the cursor would be stale.
    if (!k || loadingMore.current || refreshing.current || nextPage <= 1) {
      return;
    }
    loadingMore.current = true;
    setIsLoadingMore(true);
    fetchPage(nextPage, refreshGen.current)
      .catch(e => {
        if (activeKey.current === k) {
          setError(message(e));
        }
      })
      .finally(() => {
        loadingMore.current = false;
        if (activeKey.current === k) {
          setIsLoadingMore(false);
        }
      });
  }, [fetchPage, nextPage]);

  useEffect(() => {
    activeKey.current = key;
    loadingMore.current = false;
    refreshing.current = false;
    setGames([]);
    setNextPage(-1);
    setError(null);
    setIsLoading(key !== null);
    setIsLoadingMore(false);
    if (!key) {
      return;
    }
    try {
      showCache(key);
    } catch (e) {
      setError(message(e));
    }
    refresh();
    return () => {
      activeKey.current = null;
    };
  }, [key, refresh]);

  return {
    games,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore: nextPage > 1,
    error,
    refresh,
    loadMore,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOpponents } from '../api/opponents';
import type { OpponentTeam } from '../api/types';
import { readOpponents, replaceOpponents } from '../db/repositories';

// An organisation's opponent teams for the hub's Opponent toggle. The cached
// list shows at once; the server's list is fetched the first time the toggle
// is opened for an organisation, and again on reload() (after an add or
// rename). iOS fetches them in the launch sync and once per organisation
// when the list is empty.

export type OpponentsState = {
  opponents: OpponentTeam[];
  isSyncing: boolean;
  error: string | null;
  /** Re-reads the cache now and fetches the server's list. */
  reload: () => void;
};

const readCache = (orgId: number): OpponentTeam[] => {
  try {
    return readOpponents(orgId);
  } catch {
    return [];
  }
};

export function useOpponents(userId: number | undefined, orgId: number | undefined, active: boolean): OpponentsState {
  const [opponents, setOpponents] = useState<OpponentTeam[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The organisation whose list has been fetched (or is being fetched). A ref,
  // so recording it doesn't re-run the fetch effect and cancel the request.
  const fetchedFor = useRef<number | undefined>(undefined);
  // Bumped by reload(): fetch again for the same organisation.
  const [nonce, setNonce] = useState(0);

  // A new organisation: show its cached list; it is fetched when the toggle opens.
  useEffect(() => {
    fetchedFor.current = undefined;
    setOpponents(orgId === undefined ? [] : readCache(orgId));
    setError(null);
    setIsSyncing(false);
  }, [orgId]);

  useEffect(() => {
    if (!active || userId === undefined || orgId === undefined || fetchedFor.current === orgId) {
      return;
    }
    fetchedFor.current = orgId;
    let cancelled = false;
    let done = false;
    setIsSyncing(true);
    setError(null);
    fetchOpponents(userId, orgId)
      .then(list => {
        if (!cancelled) {
          replaceOpponents(orgId, list);
          setOpponents(readCache(orgId));
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load opponent teams.');
        }
      })
      .finally(() => {
        done = true;
        if (!cancelled) {
          setIsSyncing(false);
        }
      });
    return () => {
      cancelled = true;
      if (!done) {
        // Dropped before it answered (the toggle closed, or another org):
        // fetch again next time.
        fetchedFor.current = undefined;
        setIsSyncing(false);
      }
    };
  }, [active, userId, orgId, nonce]);

  const reload = useCallback(() => {
    if (orgId !== undefined) {
      setOpponents(readCache(orgId));
    }
    fetchedFor.current = undefined;
    setNonce(n => n + 1);
  }, [orgId]);

  return { opponents, isSyncing, error, reload };
}

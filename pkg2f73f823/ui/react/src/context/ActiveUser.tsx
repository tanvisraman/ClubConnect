/*
 * ActiveUser context — the app's RBAC / multi-tenant anchor.
 *
 * A real deployment would derive the signed-in user and their row-level scope
 * from the platform session + ActionRules. For this demo we model AppUser as
 * data and let the viewer switch personas; every page reads the active user's
 * role and orgId to scope what it fetches and what actions it offers.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { c3Action } from '@/c3Action';
import type { AppUser } from '@/Interfaces';

const STORAGE_KEY = 'clubhub.activeUserId';
const DEFAULT_USER_ID = 'user_dssd_officer';

interface ActiveUserContextValue {
  users: AppUser[];
  activeUser: AppUser | null;
  loading: boolean;
  setActiveUserId: (id: string) => void;
  /** Club id in scope when the active user is a club persona, else null. */
  activeClubId: string | null;
  /** Company id in scope when the active user is a company persona, else null. */
  activeCompanyId: string | null;
  /** ServiceProvider id in scope when the active user is a vendor persona, else null. */
  activeServiceProviderId: string | null;
}

const ActiveUserContext = createContext<ActiveUserContextValue | undefined>(undefined);

export function ActiveUserProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activeUserId, setActiveUserIdState] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_USER_ID;
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_USER_ID;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await c3Action('AppUser', 'fetch', {
          include: 'this',
          order: 'ascending(role)',
          limit: -1,
        });
        if (!cancelled) setUsers((resp?.objs ?? []) as AppUser[]);
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setActiveUserId = useCallback((id: string) => {
    setActiveUserIdState(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activeUser = useMemo(() => {
    if (users.length === 0) return null;
    return users.find((u) => u.id === activeUserId) ?? users[0];
  }, [users, activeUserId]);

  const activeClubId = useMemo(
    () => (activeUser?.orgType === 'Club' ? activeUser.orgId ?? null : null),
    [activeUser],
  );
  const activeCompanyId = useMemo(
    () => (activeUser?.orgType === 'Company' ? activeUser.orgId ?? null : null),
    [activeUser],
  );
  const activeServiceProviderId = useMemo(
    () => (activeUser?.orgType === 'ServiceProvider' ? activeUser.orgId ?? null : null),
    [activeUser],
  );

  const value = useMemo(
    () => ({
      users,
      activeUser,
      loading,
      setActiveUserId,
      activeClubId,
      activeCompanyId,
      activeServiceProviderId,
    }),
    [
      users,
      activeUser,
      loading,
      setActiveUserId,
      activeClubId,
      activeCompanyId,
      activeServiceProviderId,
    ],
  );

  return <ActiveUserContext.Provider value={value}>{children}</ActiveUserContext.Provider>;
}

export function useActiveUser(): ActiveUserContextValue {
  const ctx = useContext(ActiveUserContext);
  if (!ctx) {
    throw new Error('useActiveUser must be used within an ActiveUserProvider');
  }
  return ctx;
}

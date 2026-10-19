/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useEffect } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard/Dashboard';
import Outreach from './pages/Outreach/Outreach';
import Grants from './pages/Grants/Grants';
import Vendors from './pages/Vendors/Vendors';
import Connections from './pages/Connections/Connections';
import Requests from './pages/Requests/Requests';
import ClubDirectory from './pages/ClubDirectory/ClubDirectory';
import VendorBoard from './pages/VendorBoard/VendorBoard';
import SideNav from './components/SideNav/SideNav';
import TopNav from './components/TopNav/TopNav';
import RoleSwitcher from './components/RoleSwitcher/RoleSwitcher';
import { ActiveUserProvider, useActiveUser } from './context/ActiveUser';
import { navigationConfig, isNavItemVisible, visibleNavItems } from './config/navigation';
import ErrorReporterProvider from './components/ErrorBoundary/ErrorBoundary';

/**
 * Does the given nav item own the current pathname? Mirrors SideNav's
 * active-route logic: '/' matches only the exact root, every other path matches
 * itself or any nested child route.
 */
function matchesPath(itemPath: string, pathname: string): boolean {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

/**
 * Role-based route guard. If the active persona navigates (or is dropped by a
 * persona switch) onto a tab its role may not see, bounce it to the first tab
 * the role is allowed to open. This enforces, at the router level, the same
 * access rules the SideNav uses to hide tabs.
 */
function RoleRedirect() {
  const { activeUser, loading } = useActiveUser();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !activeUser) return;
    const role = activeUser.role;
    const current = navigationConfig.find((item) => matchesPath(item.path, location.pathname));
    // Only guard known tabs; leave unknown routes to the catch-all page.
    if (current && !isNavItemVisible(current, role)) {
      const fallback = visibleNavItems(role)[0]?.path ?? '/';
      navigate(fallback, { replace: true });
    }
  }, [activeUser, loading, location.pathname, navigate]);

  return null;
}

/**
 * The persona switcher is part of the shell and is shown on EVERY page.
 *
 * It must NOT be Dashboard-only: some personas can never open the Dashboard —
 * e.g. a Vendor Rep (such as Ian's Pizza) is allowed only the Menu Board, and
 * the {@link RoleRedirect} guard bounces them off `/` to that single tab. If the
 * switcher rendered only on `/`, those personas would be stranded with no way to
 * switch back to the other profiles. Keeping it mounted here guarantees you can
 * always navigate back and see the other profile options, whatever persona you
 * are currently acting as.
 */

/**
 * Application shell.
 *
 * The chrome — {@link TopNav} across the top and {@link SideNav} down the left —
 * is rendered here, OUTSIDE `<Routes>`, so it is present on **every** page. The
 * router only ever swaps the `<main>` content; the top bar and side nav are part
 * of the shell and cannot be dropped by an individual page. Per the C3 Design
 * System, the TopNavBar is expected on every screen — keep it mounted here and
 * do not move it inside a route.
 */
export default function App() {
  return (
    <ErrorReporterProvider>
      <ActiveUserProvider>
      <div className="h-screen flex flex-col max-w-full overflow-hidden">
        <TopNav title="UW-Madison Club Platform" />
        <div className="flex flex-1 min-h-0">
          <SideNav />
          <div className="flex-1 flex flex-col min-w-0">
            <RoleRedirect />
            <RoleSwitcher />
            <main className="flex-1 overflow-auto bg-[var(--c3-style-basic-bg-page)]">
              <Routes>
                {/* Add page routes here */}
                <Route path="/" element={<Dashboard />} />
                <Route path="/outreach" element={<Outreach />} />
                <Route path="/grants" element={<Grants />} />
                <Route path="/vendors" element={<Vendors />} />
                <Route path="/connections" element={<Connections />} />
                <Route path="/clubs" element={<ClubDirectory />} />
                <Route path="/requests" element={<Requests />} />
                <Route path="/menu-board" element={<VendorBoard />} />
                <Route
                  path="*"
                  element={
                    import.meta.env.MODE === 'development' ? (
                      <div className="flex h-full items-center justify-center p-8 text-center text-[var(--c3-style-basic-fg-neutral)]">
                        <p>No route matched. Add routes in App.tsx.</p>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center p-8 text-center text-[var(--c3-style-basic-fg-neutral)]">
                        <p>Page not found.</p>
                      </div>
                    )
                  }
                />
              </Routes>
            </main>
          </div>
        </div>
      </div>
      </ActiveUserProvider>
    </ErrorReporterProvider>
  );
}

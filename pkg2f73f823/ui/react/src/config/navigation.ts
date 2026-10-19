/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import {
  House,
  Handshake,
  Award,
  UtensilsCrossed,
  Network,
  Inbox,
  Users,
  ChefHat,
} from 'lucide-react';

import { NavigationItem } from '@/types/navigation';

/**
 * Roles with full club-officer access (every workflow tab). Club members and
 * the platform admin ride along with the club officer so the demo personas all
 * see the full product surface.
 */
const CLUB_ROLES = ['PlatformAdmin', 'ClubOfficer', 'ClubMember'];

/**
 * Navigation configuration for the application.
 *
 * Each item declares the {@link NavigationItem.roles} allowed to see it; the
 * left navigation ({@link SideNav}) and the route guard in `App` both read this
 * so each persona only ever sees — and can only reach — its own tabs:
 *  - **Club officers** (+ members, admin) get every workflow tab.
 *  - **Company reps** get the Dashboard, the Clubs directory, and the Requests board.
 *  - **Vendor reps** get only their Menu Board.
 *
 * To add a new page:
 * 1. Add a new item to this array (set `roles` to control who sees it)
 * 2. Make sure the path matches your route in App.tsx
 * 3. Add the corresponding page component
 */
export const navigationConfig: NavigationItem[] = [
  {
    id: 'dashboard',
    path: '/',
    icon: House,
    iconActive: House,
    label: 'Dashboard',
    tooltip: 'Dashboard Overview',
    roles: [...CLUB_ROLES, 'CompanyRep'],
  },
  {
    id: 'outreach',
    path: '/outreach',
    icon: Handshake,
    iconActive: Handshake,
    label: 'Sponsorship Outreach',
    tooltip: 'AI-ranked, warm-intro sponsorship outreach',
    roles: CLUB_ROLES,
  },
  {
    id: 'grants',
    path: '/grants',
    icon: Award,
    iconActive: Award,
    label: 'Grant Discovery',
    tooltip: 'AI-ranked funding opportunities with eligibility checks',
    roles: CLUB_ROLES,
  },
  {
    id: 'vendors',
    path: '/vendors',
    icon: UtensilsCrossed,
    iconActive: UtensilsCrossed,
    label: 'Vendor Sourcing',
    tooltip: 'Compare caterers by price-fit for an event',
    roles: CLUB_ROLES,
  },
  {
    id: 'connections',
    path: '/connections',
    icon: Network,
    iconActive: Network,
    label: 'Connections',
    tooltip: 'Warm alumni introductions, consent-gated',
    roles: CLUB_ROLES,
  },
  {
    id: 'clubs',
    path: '/clubs',
    icon: Users,
    iconActive: Users,
    label: 'Clubs Directory',
    tooltip: 'Browse every club you can reach out to',
    roles: ['PlatformAdmin', 'CompanyRep'],
  },
  {
    id: 'requests',
    path: '/requests',
    icon: Inbox,
    iconActive: Inbox,
    label: 'Company Requests',
    tooltip: 'Opportunities companies post for clubs',
    roles: [...CLUB_ROLES, 'CompanyRep'],
  },
  {
    id: 'menu-board',
    path: '/menu-board',
    icon: ChefHat,
    iconActive: ChefHat,
    label: 'Menu Board',
    tooltip: 'Post your menu, prices, and vital info',
    roles: ['PlatformAdmin', 'ServiceProviderRep'],
  },
];

/**
 * Whether a navigation item is visible to the given role. Items with no
 * `roles` restriction are visible to everyone; while the active role is still
 * loading (empty string) nothing is shown.
 */
export const isNavItemVisible = (item: NavigationItem, role: string): boolean => {
  if (!item.roles || item.roles.length === 0) return true;
  return role !== '' && item.roles.includes(role);
};

/**
 * The navigation items the given role may see, in declared order.
 */
export const visibleNavItems = (role: string): NavigationItem[] =>
  navigationConfig.filter((item) => isNavItemVisible(item, role));

/**
 * Helper function to add navigation item dynamically
 */
export const addNavigationItem = (item: NavigationItem) => {
  navigationConfig.push(item);
};

/**
 * Helper function to remove navigation item
 */
export const removeNavigationItem = (id: string) => {
  const index = navigationConfig.findIndex((item) => item.id === id);
  if (index > -1) {
    navigationConfig.splice(index, 1);
  }
};

/**
 * Helper function to update badge count
 */
export const updateNavigationBadge = (id: string, badge?: number) => {
  const item = navigationConfig.find((item) => item.id === id);
  if (item) {
    item.badge = badge;
  }
};

/*
 * RoleSwitcher — a slim persona bar that lets the viewer act as any seeded
 * AppUser. Switching persona changes the active role + org scope, which every
 * workflow page reads to decide what it may fetch and which actions it offers.
 */

import React, { useMemo } from 'react';
import { UserCog } from 'lucide-react';

import { useActiveUser } from '@/context/ActiveUser';
import { Badge } from '@/components/ui/badge';

const ROLE_LABEL: Record<string, string> = {
  PlatformAdmin: 'Platform Admin',
  ClubOfficer: 'Club Officer',
  ClubMember: 'Club Member',
  CompanyRep: 'Company Rep',
  ServiceProviderRep: 'Vendor Rep',
};

const RoleSwitcher: React.FC = () => {
  const { users, activeUser, loading, setActiveUserId } = useActiveUser();

  // Alumni is no longer a selectable persona — hide any AlumniUser rows.
  const selectableUsers = useMemo(
    () => users.filter((u) => u.role !== 'AlumniUser'),
    [users],
  );

  return (
    <div className="flex items-center justify-between gap-[var(--c3-style-spacing-12)] border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-[var(--c3-style-spacing-24)] py-[var(--c3-style-spacing-8)]">
      <div className="flex items-center gap-[var(--c3-style-spacing-8)] text-[var(--c3-style-basic-fg-secondary)]">
        <UserCog className="size-4" aria-hidden />
        <span className="text-c3-regular-body-p3">Multi-tenant demo — view as a persona:</span>
      </div>
      <div className="flex items-center gap-[var(--c3-style-spacing-12)]">
        {activeUser ? (
          <Badge variant="soft" appearance="accent">
            {ROLE_LABEL[activeUser.role] ?? activeUser.role}
          </Badge>
        ) : null}
        <label htmlFor="persona-select" className="sr-only">
          Active persona
        </label>
        <select
          id="persona-select"
          value={activeUser?.id ?? ''}
          disabled={loading || selectableUsers.length === 0}
          onChange={(e) => setActiveUserId(e.target.value)}
          className="rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-6)] font-sans text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-primary)] outline-none disabled:opacity-60"
        >
          {selectableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} — {ROLE_LABEL[u.role] ?? u.role}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default RoleSwitcher;

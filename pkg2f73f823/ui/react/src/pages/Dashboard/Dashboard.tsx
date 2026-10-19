/*
 * Dashboard — the role-aware front door to the platform.
 *
 * It reads the active persona (via useActiveUser) and renders (a) a strip of
 * KPI tiles counting the graph the platform is built on, and (b) the set of
 * agent workflows that persona can act on, each linking into its workspace.
 * The graph is the moat; the agents are the UX — this page surfaces both.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Handshake,
  Award,
  UtensilsCrossed,
  Network,
  Inbox,
  Users,
  Building2,
  Landmark,
  ShieldCheck,
  ArrowRight,
  Search,
  type LucideIcon,
} from 'lucide-react';

import { c3Action } from '@/c3Action';
import { useActiveUser } from '@/context/ActiveUser';
import CompanyRepDashboard from './CompanyRepDashboard';
import { PageHeader } from '@/components/ui/page-header';
import {
  MetricCard,
  MetricCardHeader,
  MetricCardLabel,
  MetricCardValue,
  MetricCardCaption,
} from '@/components/ui/metric-card';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface WorkflowLink {
  id: string;
  path: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Which personas this workflow is primarily built for. */
  roles: string[];
}

const WORKFLOWS: WorkflowLink[] = [
  {
    id: 'outreach',
    path: '/outreach',
    icon: Handshake,
    title: 'Sponsorship Outreach',
    description:
      'Rank prospective sponsors by warm-intro strength and draft outreach emails — behind an approval gate.',
    roles: ['ClubOfficer', 'ClubMember', 'PlatformAdmin'],
  },
  {
    id: 'grants',
    path: '/grants',
    icon: Award,
    title: 'Grant Discovery',
    description:
      'Surface funding opportunities ranked for your club, with eligibility checks and draft starters.',
    roles: ['ClubOfficer', 'ClubMember', 'PlatformAdmin'],
  },
  {
    id: 'vendors',
    path: '/vendors',
    icon: UtensilsCrossed,
    title: 'Vendor Sourcing',
    description:
      'Compare caterers by price-fit against an event’s headcount, budget, and cuisine preference.',
    roles: ['ClubOfficer', 'ClubMember', 'PlatformAdmin'],
  },
  {
    id: 'connections',
    path: '/connections',
    icon: Network,
    title: 'Connections',
    description:
      'Find the warmest, most relevant alumni introductions in your network — consent-gated.',
    roles: ['ClubOfficer', 'ClubMember', 'PlatformAdmin'],
  },
  {
    id: 'clubs',
    path: '/clubs',
    icon: Search,
    title: 'Clubs Directory',
    description:
      'Browse every UW-Madison club you can reach out to, with mission and contact details.',
    roles: ['CompanyRep', 'PlatformAdmin'],
  },
  {
    id: 'requests',
    path: '/requests',
    icon: Inbox,
    title: 'Company Requests',
    description:
      'Browse opportunities companies have posted and apply your club — or manage your own postings.',
    roles: ['ClubOfficer', 'ClubMember', 'CompanyRep', 'PlatformAdmin'],
  },
];

interface Stats {
  clubs: number;
  companies: number;
  openGrants: number;
  vendors: number;
  openRequests: number;
  consentedAlumni: number;
}

async function count(type: string, filter?: string): Promise<number> {
  const spec: Record<string, unknown> = { include: 'this', limit: -1 };
  if (filter) spec.filter = filter;
  const resp = await c3Action(type, 'fetch', spec);
  return (resp?.objs ?? []).length;
}

const ROLE_LABEL: Record<string, string> = {
  PlatformAdmin: 'Platform Admin',
  ClubOfficer: 'Club Officer',
  ClubMember: 'Club Member',
  CompanyRep: 'Company Rep',
  ServiceProviderRep: 'Vendor Rep',
  AlumniUser: 'Alumni',
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { activeUser, activeClubId, activeCompanyId, loading: userLoading } = useActiveUser();

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [clubs, companies, openGrants, vendors, openRequests, consentedAlumni] =
        await Promise.all([
          count('Club'),
          count('Company'),
          count('Grant', "status != 'closed'"),
          count('ServiceProvider'),
          count('CompanyRequest', "status != 'closed'"),
          count('Affiliation', "consentStatus == 'opted_in'"),
        ]);
      setStats({ clubs, companies, openGrants, vendors, openRequests, consentedAlumni });
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const role = activeUser?.role ?? '';
  const isCompanyRep = role === 'CompanyRep';

  useEffect(() => {
    if (userLoading) return;
    // A CompanyRep sees a dedicated, scoped dashboard — never the platform-graph
    // KPIs (companies, alumni, grants, vendors) — so we don't even query them.
    if (isCompanyRep) {
      setLoading(false);
      return;
    }
    loadStats();
  }, [userLoading, isCompanyRep, loadStats]);

  const relevantWorkflows = useMemo(
    () => WORKFLOWS.filter((w) => w.roles.includes(role)),
    [role],
  );
  // Non-club, non-company personas (alumni, vendor) still see everything read-only.
  const workflows = relevantWorkflows.length > 0 ? relevantWorkflows : WORKFLOWS;

  const scopeLabel = activeClubId
    ? 'Acting within your club’s workspace'
    : activeCompanyId
      ? 'Acting within your company’s workspace'
      : 'Platform-wide view';

  // CompanyReps get a dedicated, scoped dashboard (their company's requests +
  // the clubs applying to them) — not the platform-graph KPIs or workflow cards.
  if (isCompanyRep) {
    return (
      <CompanyRepDashboard companyId={activeCompanyId ?? ''} fallbackName={activeUser?.name} />
    );
  }

  return (
    <div className="flex min-h-full w-full flex-col">
      <PageHeader
        title={`Welcome${activeUser ? `, ${activeUser.name.split(' ')[0]}` : ''}`}
        badges={
          activeUser ? (
            <Badge appearance="accent" variant="soft" leadingIcon={<ShieldCheck />}>
              {ROLE_LABEL[role] ?? role}
            </Badge>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-[var(--c3-style-spacing-24)] p-[var(--c3-style-spacing-24)]">
        <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
          {scopeLabel}
          {userLoading ? ' · loading persona…' : ''}
        </p>

        {/* KPI strip */}
        {loading ? (
          <div className="flex items-center justify-center gap-[var(--c3-style-spacing-8)] py-10 text-[var(--c3-style-basic-fg-secondary)]">
            <Spinner size="lg" />
            <span className="text-c3-regular-body-p2">Loading the graph…</span>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-[var(--c3-style-spacing-12)] md:grid-cols-3 xl:grid-cols-6">
            <MetricCard variant="outlined">
              <MetricCardHeader>
                <MetricCardLabel>Clubs</MetricCardLabel>
                <Users className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
              </MetricCardHeader>
              <MetricCardValue>{stats.clubs}</MetricCardValue>
              <MetricCardCaption>Student organizations</MetricCardCaption>
            </MetricCard>

            <MetricCard variant="outlined">
              <MetricCardHeader>
                <MetricCardLabel>Companies</MetricCardLabel>
                <Building2
                  className="size-4 text-[var(--c3-style-basic-fg-secondary)]"
                  aria-hidden
                />
              </MetricCardHeader>
              <MetricCardValue>{stats.companies}</MetricCardValue>
              <MetricCardCaption>Prospective sponsors</MetricCardCaption>
            </MetricCard>

            <MetricCard variant="outlined">
              <MetricCardHeader>
                <MetricCardLabel>Consented alumni</MetricCardLabel>
                <ShieldCheck
                  className="size-4 text-[var(--c3-style-basic-fg-secondary)]"
                  aria-hidden
                />
              </MetricCardHeader>
              <MetricCardValue>{stats.consentedAlumni}</MetricCardValue>
              <MetricCardCaption>Opted-in relationships</MetricCardCaption>
            </MetricCard>

            <MetricCard variant="outlined">
              <MetricCardHeader>
                <MetricCardLabel>Open grants</MetricCardLabel>
                <Landmark
                  className="size-4 text-[var(--c3-style-basic-fg-secondary)]"
                  aria-hidden
                />
              </MetricCardHeader>
              <MetricCardValue>{stats.openGrants}</MetricCardValue>
              <MetricCardCaption>Accepting applications</MetricCardCaption>
            </MetricCard>

            <MetricCard variant="outlined">
              <MetricCardHeader>
                <MetricCardLabel>Vendors</MetricCardLabel>
                <UtensilsCrossed
                  className="size-4 text-[var(--c3-style-basic-fg-secondary)]"
                  aria-hidden
                />
              </MetricCardHeader>
              <MetricCardValue>{stats.vendors}</MetricCardValue>
              <MetricCardCaption>Caterers on platform</MetricCardCaption>
            </MetricCard>

            <MetricCard variant="outlined">
              <MetricCardHeader>
                <MetricCardLabel>Open requests</MetricCardLabel>
                <Inbox className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
              </MetricCardHeader>
              <MetricCardValue>{stats.openRequests}</MetricCardValue>
              <MetricCardCaption>Company opportunities</MetricCardCaption>
            </MetricCard>
          </div>
        ) : null}

        {/* Workflow entry points */}
        <div className="flex flex-col gap-[var(--c3-style-spacing-12)]">
          <h2 className="text-c3-bold-heading-h6 text-[var(--c3-style-basic-fg-primary)]">
            Your workflows
          </h2>
          <div className="grid grid-cols-1 gap-[var(--c3-style-spacing-16)] md:grid-cols-2 xl:grid-cols-3">
            {workflows.map((w) => {
              const WIcon = w.icon;
              return (
                <Card key={w.id} variant="elevated" className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-[var(--c3-style-spacing-8)]">
                      <span className="inline-flex size-8 items-center justify-center rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-accent)] text-[var(--c3-style-basic-fg-accent)]">
                        <WIcon className="size-4" aria-hidden />
                      </span>
                      {w.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <CardDescription>{w.description}</CardDescription>
                  </CardContent>
                  <CardFooter className="justify-end">
                    <Button
                      variant="soft"
                      appearance="accent"
                      onClick={() => navigate(w.path)}
                    >
                      Open <ArrowRight className="size-4" aria-hidden />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

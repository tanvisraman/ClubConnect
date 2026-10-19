/*
 * Grants board — the grant-discovery agent's workspace.
 *
 * A club officer runs Club.discoverGrants, which asks the platform LLM to rank
 * open grants against the club's mission/category, judge eligibility, and draft
 * an application starter. Results are explainable MatchResults (workflow="grant").
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Landmark,
  CalendarDays,
  CircleDollarSign,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileText,
  Award,
} from 'lucide-react';

import { c3Action, c3MemberAction } from '@/c3Action';
import type { Grant, MatchResult } from '@/Interfaces';
import { useActiveUser } from '@/context/ActiveUser';
import { PageHeader } from '@/components/ui/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge, type BadgeAppearance } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Alert,
  AlertAppearanceIcon,
  AlertContent,
  AlertTitle,
  AlertDescription,
} from '@/components/ui/alert';

const MAX_GRANTS = 6;

interface GrantExtra {
  eligible?: boolean;
  eligibilityNote?: string;
  draftStarter?: string;
  amount?: number;
  deadline?: string;
}

function parseExtra(json?: string): GrantExtra {
  if (!json) return {};
  try {
    return JSON.parse(json) as GrantExtra;
  } catch {
    return {};
  }
}

function scoreAppearance(score?: number): BadgeAppearance {
  if (score == null) return 'secondary';
  if (score >= 85) return 'success';
  if (score >= 70) return 'accent';
  return 'secondary';
}

function formatDeadline(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const Grants: React.FC = () => {
  const { activeUser, activeClubId } = useActiveUser();
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [grantsById, setGrantsById] = useState<Record<string, Grant>>({});
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchMatches = useCallback(async (clubId: string): Promise<MatchResult[]> => {
    const resp = await c3Action('MatchResult', 'fetch', {
      filter: `workflow == 'grant' && sourceId == '${clubId}'`,
      include: 'this',
      order: 'descending(score)',
      limit: 50,
    });
    return (resp?.objs ?? []) as MatchResult[];
  }, []);

  const loadAll = useCallback(async () => {
    if (!activeClubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [matchList, grantResp] = await Promise.all([
        fetchMatches(activeClubId),
        c3Action('Grant', 'fetch', { include: 'this', limit: -1 }),
      ]);
      const map: Record<string, Grant> = {};
      ((grantResp?.objs ?? []) as Grant[]).forEach((g) => {
        map[g.id] = g;
      });
      setGrantsById(map);
      setMatches(matchList);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Failed to load grant matches.');
    } finally {
      setLoading(false);
    }
  }, [activeClubId, fetchMatches]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleDiscover = useCallback(async () => {
    if (!activeClubId) return;
    setDiscovering(true);
    setError(null);
    try {
      const result = (await c3MemberAction('Club', 'discoverGrants', { id: activeClubId }, [
        MAX_GRANTS,
      ])) as MatchResult[];
      setMatches(result ?? []);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'The grant-discovery agent failed. Please try again.');
    } finally {
      setDiscovering(false);
    }
  }, [activeClubId]);

  const openCount = matches.length;
  const eligibleCount = useMemo(
    () => matches.filter((m) => parseExtra(m.extraJson).eligible).length,
    [matches],
  );

  if (!activeClubId) {
    return (
      <div className="flex min-h-full w-full flex-col">
        <PageHeader title="Grants" description="Grant discovery for your club" />
        <div className="p-[var(--c3-style-spacing-24)]">
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>Switch to a club persona</AlertTitle>
              <AlertDescription>
                Grant discovery is scoped to a club. You are currently acting as{' '}
                {activeUser?.name ?? 'a non-club user'} ({activeUser?.role}). Use the persona
                switcher to view as a Club Officer.
              </AlertDescription>
            </AlertContent>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full flex-col">
      <PageHeader
        title="Grants"
        description="AI-ranked funding opportunities with eligibility checks and draft starters"
        badges={
          <Badge appearance="accent" variant="soft" leadingIcon={<Award />}>
            Grant-discovery agent
          </Badge>
        }
        actions={
          <div className="flex items-center gap-[var(--c3-style-spacing-8)]">
            <Button
              variant="outline"
              appearance="secondary"
              leadingIcon={<RefreshCw />}
              onClick={loadAll}
              disabled={loading || discovering}
            >
              Refresh
            </Button>
            <Button
              appearance="accent"
              leadingIcon={<Sparkles />}
              loading={discovering}
              onClick={handleDiscover}
              disabled={loading}
            >
              {matches.length > 0 ? 'Re-run agent' : 'Discover grants'}
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-[var(--c3-style-spacing-16)] p-[var(--c3-style-spacing-24)]">
        {error ? (
          <Alert variant="soft" appearance="destructive">
            <AlertAppearanceIcon appearance="destructive" />
            <AlertContent>
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {!loading && matches.length > 0 ? (
          <div className="flex flex-wrap items-center gap-[var(--c3-style-spacing-12)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
            <span>{openCount} grants ranked</span>
            <span>·</span>
            <span>{eligibleCount} likely eligible</span>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-[var(--c3-style-spacing-8)] py-16 text-[var(--c3-style-basic-fg-secondary)]">
            <Spinner size="lg" />
            <span className="text-c3-regular-body-p2">Loading grants…</span>
          </div>
        ) : null}

        {discovering ? (
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>Agent is working…</AlertTitle>
              <AlertDescription>
                Ranking open grants against your club&apos;s mission, checking eligibility, and
                drafting application starters. This runs a live LLM call.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {!loading && !discovering && matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] py-16 text-center">
            <Landmark className="size-6 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
            <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
              No grant matches yet
            </p>
            <p className="max-w-[420px] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              Run the grant-discovery agent to rank funding opportunities for your club with
              eligibility checks and draft application starters.
            </p>
            <Button
              appearance="accent"
              leadingIcon={<Sparkles />}
              onClick={handleDiscover}
              className="mt-2"
            >
              Discover grants
            </Button>
          </div>
        ) : null}

        {matches.map((m, idx) => {
          const extra = parseExtra(m.extraJson);
          const grant = m.targetId ? grantsById[m.targetId] : undefined;
          const isOpen = expanded[m.id] ?? false;
          return (
            <Card key={m.id} variant="elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-[var(--c3-style-spacing-8)]">
                  <span className="inline-flex size-6 items-center justify-center rounded-[var(--c3-style-border-radius-rounded)] bg-[var(--c3-style-basic-bg-secondary)] text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                    {idx + 1}
                  </span>
                  {m.targetName ?? grant?.name ?? 'Grant'}
                </CardTitle>
                <CardDescription>{grant?.source ?? ''}</CardDescription>
                <CardAction>
                  <Badge appearance={scoreAppearance(m.score)} variant="solid">
                    {Math.round(m.score ?? 0)} fit
                  </Badge>
                  {extra.eligible != null ? (
                    <Badge
                      appearance={extra.eligible ? 'success' : 'danger'}
                      variant="soft"
                      leadingIcon={extra.eligible ? <CheckCircle2 /> : <XCircle />}
                    >
                      {extra.eligible ? 'Likely eligible' : 'Check eligibility'}
                    </Badge>
                  ) : null}
                </CardAction>
              </CardHeader>

              <CardContent className="flex flex-col gap-[var(--c3-style-spacing-12)]">
                <div className="flex flex-wrap items-center gap-[var(--c3-style-spacing-16)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                  <span className="inline-flex items-center gap-[var(--c3-style-spacing-6)]">
                    <CircleDollarSign className="size-4" aria-hidden />
                    {typeof extra.amount === 'number'
                      ? `$${extra.amount.toLocaleString()}`
                      : grant?.amount
                        ? `$${grant.amount.toLocaleString()}`
                        : '—'}
                  </span>
                  <span className="inline-flex items-center gap-[var(--c3-style-spacing-6)]">
                    <CalendarDays className="size-4" aria-hidden />
                    Due {formatDeadline(extra.deadline ?? grant?.deadline)}
                  </span>
                  {(grant?.targetCategories ?? []).slice(0, 3).map((c) => (
                    <Badge key={c} variant="outline" appearance="secondary">
                      {c}
                    </Badge>
                  ))}
                </div>

                {m.rationale ? (
                  <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                    <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">
                      Why:{' '}
                    </span>
                    {m.rationale}
                  </p>
                ) : null}

                {extra.eligibilityNote ? (
                  <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                    <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">
                      Eligibility:{' '}
                    </span>
                    {extra.eligibilityNote}
                  </p>
                ) : null}

                {extra.draftStarter ? (
                  <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                    <Button
                      variant="ghost"
                      appearance="accent"
                      size="sm"
                      leadingIcon={<FileText />}
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [m.id]: !isOpen }))
                      }
                      className="self-start"
                    >
                      {isOpen ? 'Hide draft starter' : 'Show draft starter'}
                    </Button>
                    {isOpen ? (
                      <div className="rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-accent)] p-[var(--c3-style-spacing-12)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                        {extra.draftStarter}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {m.provenance ? (
                  <p className="text-c3-regular-body-p4 text-[var(--c3-style-basic-fg-tertiary)]">
                    Provenance: {m.provenance}
                  </p>
                ) : null}
              </CardContent>

              {grant?.url ? (
                <CardFooter bordered className="justify-end">
                  <a
                    href={grant.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-[var(--c3-style-spacing-6)] text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-accent)]"
                  >
                    View grant <ExternalLink className="size-4" aria-hidden />
                  </a>
                </CardFooter>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Grants;

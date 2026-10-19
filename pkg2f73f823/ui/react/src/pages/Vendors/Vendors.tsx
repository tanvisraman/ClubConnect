/*
 * Vendor sourcing — the vendor-sourcing agent's comparison workspace.
 *
 * A club officer picks one of their club's events, then runs
 * ClubEvent.sourceVendors, which computes numeric price-fit for every caterer's
 * menu against the event's headcount/budget/cuisine and asks the LLM to rank the
 * best options. Results are explainable MatchResults (workflow="vendor").
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  UtensilsCrossed,
  Users,
  Wallet,
  Star,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

import { c3Action, c3MemberAction } from '@/c3Action';
import type { ClubEvent, MatchResult } from '@/Interfaces';
import { useActiveUser } from '@/context/ActiveUser';
import { PageHeader } from '@/components/ui/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
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

const MAX_VENDORS = 6;

interface VendorExtra {
  recommendedItem?: string;
  estimatedTotal?: number;
  withinBudget?: boolean;
  rating?: number;
  cuisines?: string[];
}

function parseExtra(json?: string): VendorExtra {
  if (!json) return {};
  try {
    return JSON.parse(json) as VendorExtra;
  } catch {
    return {};
  }
}

function scoreAppearance(score?: number): BadgeAppearance {
  if (score == null) return 'secondary';
  if (score >= 85) return 'success';
  if (score >= 65) return 'accent';
  return 'secondary';
}

const Vendors: React.FC = () => {
  const { activeUser, activeClubId } = useActiveUser();
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourcing, setSourcing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId],
  );

  const fetchMatches = useCallback(async (eventId: string): Promise<MatchResult[]> => {
    const resp = await c3Action('MatchResult', 'fetch', {
      filter: `workflow == 'vendor' && sourceId == '${eventId}'`,
      include: 'this',
      order: 'descending(score)',
      limit: 50,
    });
    return (resp?.objs ?? []) as MatchResult[];
  }, []);

  const loadEvents = useCallback(async () => {
    if (!activeClubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await c3Action('ClubEvent', 'fetch', {
        filter: `club.id == '${activeClubId}'`,
        include: 'this, club.name',
        order: 'descending(eventDate)',
        limit: -1,
      });
      const list = (resp?.objs ?? []) as ClubEvent[];
      setEvents(list);
      setSelectedId((prev) => prev || (list[0]?.id ?? ''));
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [activeClubId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedId) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchMatches(selectedId);
        if (!cancelled) setMatches(list);
      } catch {
        if (!cancelled) setMatches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, fetchMatches]);

  const handleSource = useCallback(async () => {
    if (!selectedId) return;
    setSourcing(true);
    setError(null);
    try {
      const result = (await c3MemberAction('ClubEvent', 'sourceVendors', { id: selectedId }, [
        MAX_VENDORS,
      ])) as MatchResult[];
      setMatches(result ?? []);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'The vendor-sourcing agent failed. Please try again.');
    } finally {
      setSourcing(false);
    }
  }, [selectedId]);

  if (!activeClubId) {
    return (
      <div className="flex min-h-full w-full flex-col">
        <PageHeader title="Vendor Sourcing" description="Find and compare caterers for an event" />
        <div className="p-[var(--c3-style-spacing-24)]">
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>Switch to a club persona</AlertTitle>
              <AlertDescription>
                Vendor sourcing is scoped to a club&apos;s events. You are acting as{' '}
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
        title="Vendor Sourcing"
        description="Price-fit ranked caterers for your event"
        badges={
          <Badge appearance="accent" variant="soft" leadingIcon={<UtensilsCrossed />}>
            Vendor-sourcing agent
          </Badge>
        }
        actions={
          <div className="flex items-center gap-[var(--c3-style-spacing-8)]">
            <Button
              variant="outline"
              appearance="secondary"
              leadingIcon={<RefreshCw />}
              onClick={loadEvents}
              disabled={loading || sourcing}
            >
              Refresh
            </Button>
            <Button
              appearance="accent"
              leadingIcon={<Sparkles />}
              loading={sourcing}
              onClick={handleSource}
              disabled={loading || !selectedId}
            >
              {matches.length > 0 ? 'Re-run agent' : 'Source vendors'}
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

        {/* Event selector */}
        {!loading && events.length > 0 ? (
          <Card>
            <CardContent className="flex flex-wrap items-end gap-[var(--c3-style-spacing-16)] pt-[var(--c3-style-spacing-16)]">
              <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                <label
                  htmlFor="event-select"
                  className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                >
                  Event
                </label>
                <select
                  id="event-select"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="min-w-[280px] rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-8)] font-sans text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)] outline-none"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedEvent ? (
                <div className="flex flex-wrap items-center gap-[var(--c3-style-spacing-16)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                  <span className="inline-flex items-center gap-[var(--c3-style-spacing-6)]">
                    <Users className="size-4" aria-hidden />
                    {selectedEvent.headcount ?? '—'} guests
                  </span>
                  <span className="inline-flex items-center gap-[var(--c3-style-spacing-6)]">
                    <Wallet className="size-4" aria-hidden />
                    ${(selectedEvent.budget ?? 0).toLocaleString()} budget
                  </span>
                  <Badge variant="outline" appearance="secondary">
                    {selectedEvent.cuisine ?? 'Any'} preferred
                  </Badge>
                  {typeof selectedEvent.budget === 'number' &&
                  typeof selectedEvent.headcount === 'number' &&
                  selectedEvent.headcount > 0 ? (
                    <span>
                      (${(selectedEvent.budget / selectedEvent.headcount).toFixed(2)}/person)
                    </span>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-[var(--c3-style-spacing-8)] py-16 text-[var(--c3-style-basic-fg-secondary)]">
            <Spinner size="lg" />
            <span className="text-c3-regular-body-p2">Loading events…</span>
          </div>
        ) : null}

        {!loading && events.length === 0 ? (
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>No events yet</AlertTitle>
              <AlertDescription>This club has no events to source vendors for.</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {sourcing ? (
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>Agent is working…</AlertTitle>
              <AlertDescription>
                Computing per-head price-fit across every caterer&apos;s menu and ranking the best
                options. This runs a live LLM call.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {!loading && !sourcing && events.length > 0 && matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] py-16 text-center">
            <UtensilsCrossed
              className="size-6 text-[var(--c3-style-basic-fg-secondary)]"
              aria-hidden
            />
            <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
              No vendor comparison yet
            </p>
            <p className="max-w-[420px] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              Run the vendor-sourcing agent to rank caterers by price-fit for the selected event.
            </p>
            <Button
              appearance="accent"
              leadingIcon={<Sparkles />}
              onClick={handleSource}
              className="mt-2"
            >
              Source vendors
            </Button>
          </div>
        ) : null}

        {/* Comparison grid */}
        {matches.length > 0 ? (
          <div className="grid grid-cols-1 gap-[var(--c3-style-spacing-16)] md:grid-cols-2 xl:grid-cols-3">
            {matches.map((m, idx) => {
              const extra = parseExtra(m.extraJson);
              return (
                <Card key={m.id} variant="elevated" className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-[var(--c3-style-spacing-8)]">
                      <span className="inline-flex size-6 items-center justify-center rounded-[var(--c3-style-border-radius-rounded)] bg-[var(--c3-style-basic-bg-secondary)] text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                        {idx + 1}
                      </span>
                      {m.targetName ?? 'Vendor'}
                    </CardTitle>
                    <CardDescription>{(extra.cuisines ?? []).join(' · ')}</CardDescription>
                    <CardAction>
                      <Badge appearance={scoreAppearance(m.score)} variant="solid">
                        {Math.round(m.score ?? 0)}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-[var(--c3-style-spacing-12)]">
                    <div className="flex flex-wrap items-center gap-[var(--c3-style-spacing-8)]">
                      {extra.withinBudget != null ? (
                        <Badge
                          appearance={extra.withinBudget ? 'success' : 'warning'}
                          variant="soft"
                          leadingIcon={
                            extra.withinBudget ? <CheckCircle2 /> : <AlertTriangle />
                          }
                        >
                          {extra.withinBudget ? 'Within budget' : 'Over budget'}
                        </Badge>
                      ) : null}
                      {typeof extra.rating === 'number' ? (
                        <Badge variant="outline" appearance="secondary" leadingIcon={<Star />}>
                          {extra.rating.toFixed(1)}
                        </Badge>
                      ) : null}
                    </div>

                    {extra.recommendedItem ? (
                      <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                        <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">
                          Recommended:{' '}
                        </span>
                        {extra.recommendedItem}
                      </p>
                    ) : null}

                    {typeof extra.estimatedTotal === 'number' ? (
                      <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                        Est. ${extra.estimatedTotal.toLocaleString()} total
                      </p>
                    ) : null}

                    {m.rationale ? (
                      <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                        {m.rationale}
                      </p>
                    ) : null}

                    {m.provenance ? (
                      <p className="mt-auto text-c3-regular-body-p4 text-[var(--c3-style-basic-fg-tertiary)]">
                        {m.provenance}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Vendors;

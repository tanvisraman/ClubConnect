/*
 * Connections — the connection/matching agent's workspace.
 *
 * A club officer describes what they need (a speaker, a partner, a collaborator),
 * and Club.findConnections ranks the club's warm alumni network by warmth ×
 * relevance. Only opted-in affiliations are surfaced (the consent gate), and
 * every match carries provenance back to the Affiliation edge it came from.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Network, UserRound, Building2, ShieldCheck } from 'lucide-react';

import { c3Action, c3MemberAction } from '@/c3Action';
import type { MatchResult } from '@/Interfaces';
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

const MAX_CONNECTIONS = 6;
const DEFAULT_TOPIC =
  'data science speaker and sponsorship partner for a sustainability datathon';

function scoreAppearance(score?: number): BadgeAppearance {
  if (score == null) return 'secondary';
  if (score >= 85) return 'success';
  if (score >= 65) return 'accent';
  return 'secondary';
}

const Connections: React.FC = () => {
  const { activeUser, activeClubId } = useActiveUser();
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = useCallback(async (clubId: string): Promise<MatchResult[]> => {
    const resp = await c3Action('MatchResult', 'fetch', {
      filter: `workflow == 'connection' && sourceId == '${clubId}'`,
      include: 'this',
      order: 'descending(score)',
      limit: 50,
    });
    return (resp?.objs ?? []) as MatchResult[];
  }, []);

  const loadMatches = useCallback(async () => {
    if (!activeClubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setMatches(await fetchMatches(activeClubId));
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Failed to load connections.');
    } finally {
      setLoading(false);
    }
  }, [activeClubId, fetchMatches]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const handleFind = useCallback(async () => {
    if (!activeClubId) return;
    setFinding(true);
    setError(null);
    try {
      const result = (await c3MemberAction('Club', 'findConnections', { id: activeClubId }, [
        topic,
        MAX_CONNECTIONS,
      ])) as MatchResult[];
      setMatches(result ?? []);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'The connection agent failed. Please try again.');
    } finally {
      setFinding(false);
    }
  }, [activeClubId, topic]);

  if (!activeClubId) {
    return (
      <div className="flex min-h-full w-full flex-col">
        <PageHeader title="Connections" description="Find warm introductions in your network" />
        <div className="p-[var(--c3-style-spacing-24)]">
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>Switch to a club persona</AlertTitle>
              <AlertDescription>
                Connection matching is scoped to a club&apos;s network. You are acting as{' '}
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
        title="Connections"
        description="Warm alumni introductions ranked by relationship strength and relevance"
        badges={
          <Badge appearance="accent" variant="soft" leadingIcon={<Network />}>
            Connection agent
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            appearance="secondary"
            leadingIcon={<RefreshCw />}
            onClick={loadMatches}
            disabled={loading || finding}
          >
            Refresh
          </Button>
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

        {/* Consent note */}
        <Alert variant="soft" appearance="info">
          <ShieldCheck
            className="size-4 shrink-0 text-[var(--c3-style-basic-fg-accent)]"
            aria-hidden
          />
          <AlertContent>
            <AlertTitle>Consent-gated</AlertTitle>
            <AlertDescription>
              Only alumni who have opted in appear here. Pending and opted-out contacts are never
              surfaced to outreach, per the platform&apos;s data-use policy.
            </AlertDescription>
          </AlertContent>
        </Alert>

        {/* Topic input */}
        <Card>
          <CardContent className="flex flex-col gap-[var(--c3-style-spacing-8)] pt-[var(--c3-style-spacing-16)]">
            <label
              htmlFor="topic-input"
              className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
            >
              What are you looking for?
            </label>
            <div className="flex flex-col gap-[var(--c3-style-spacing-8)] sm:flex-row">
              <input
                id="topic-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. a data-science keynote speaker for a sustainability datathon"
                className="flex-1 rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-8)] font-sans text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)] outline-none"
              />
              <Button
                appearance="accent"
                leadingIcon={<Sparkles />}
                loading={finding}
                onClick={handleFind}
                disabled={loading || topic.trim().length === 0}
              >
                Find connections
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center gap-[var(--c3-style-spacing-8)] py-16 text-[var(--c3-style-basic-fg-secondary)]">
            <Spinner size="lg" />
            <span className="text-c3-regular-body-p2">Loading connections…</span>
          </div>
        ) : null}

        {finding ? (
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>Agent is working…</AlertTitle>
              <AlertDescription>
                Ranking your warm alumni network by warmth and relevance to your request. This runs
                a live LLM call.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {!loading && !finding && matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] py-16 text-center">
            <Network className="size-6 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
            <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
              No connections yet
            </p>
            <p className="max-w-[420px] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              Describe what you need and run the connection agent to surface the warmest, most
              relevant alumni in your network.
            </p>
          </div>
        ) : null}

        {matches.map((m, idx) => {
          const isCompany = m.targetType === 'Company';
          return (
            <Card key={m.id} variant="elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-[var(--c3-style-spacing-8)]">
                  <span className="inline-flex size-6 items-center justify-center rounded-[var(--c3-style-border-radius-rounded)] bg-[var(--c3-style-basic-bg-secondary)] text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                    {idx + 1}
                  </span>
                  {isCompany ? (
                    <Building2
                      className="size-4 text-[var(--c3-style-basic-fg-secondary)]"
                      aria-hidden
                    />
                  ) : (
                    <UserRound
                      className="size-4 text-[var(--c3-style-basic-fg-secondary)]"
                      aria-hidden
                    />
                  )}
                  {m.targetName ?? 'Contact'}
                </CardTitle>
                <CardDescription>
                  {isCompany ? 'Company' : 'Alumni contact'}
                </CardDescription>
                <CardAction>
                  <Badge appearance={scoreAppearance(m.score)} variant="solid">
                    {Math.round(m.score ?? 0)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-[var(--c3-style-spacing-8)]">
                {m.rationale ? (
                  <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                    {m.rationale}
                  </p>
                ) : null}
                {m.provenance ? (
                  <p className="text-c3-regular-body-p4 text-[var(--c3-style-basic-fg-tertiary)]">
                    Provenance: {m.provenance}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Connections;

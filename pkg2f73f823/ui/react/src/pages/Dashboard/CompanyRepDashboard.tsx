/*
 * CompanyRepDashboard — the dashboard a CompanyRep (e.g. Dana @ AWS) sees.
 *
 * Deliberately scoped: a company rep does NOT see the platform graph KPIs
 * (companies, consented alumni, grants, vendors). They see only (a) their own
 * company name at the top, (b) the open requests THEIR company has posted, and
 * (c) for each request, how many clubs submitted a proposal — with each
 * applying club clickable to open a detailed profile (skills, latest event, and
 * a visual snapshot of the club's latest Instagram and LinkedIn posts).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox,
  Building2,
  Users,
  CalendarDays,
  Instagram,
  Linkedin,
  Sparkles,
  ArrowRight,
  CircleUserRound,
} from 'lucide-react';

import { c3Action } from '@/c3Action';
import type { Company, CompanyRequest, ClubSubmission, Club, ClubEvent } from '@/Interfaces';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { PageHeader } from '@/components/ui/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Alert,
  AlertAppearanceIcon,
  AlertContent,
  AlertTitle,
  AlertDescription,
} from '@/components/ui/alert';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalSubtitle,
  ModalBody,
} from '@/components/ui/modal';

interface CompanyRepDashboardProps {
  companyId: string;
  /** Fallback name (e.g. the persona's org) used until the Company record loads. */
  fallbackName?: string;
}

const STATUS_APPEARANCE: Record<string, 'accent' | 'warning' | 'secondary'> = {
  open: 'accent',
  reviewing: 'warning',
  closed: 'secondary',
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function money(n?: number): string {
  if (typeof n !== 'number') return '—';
  return `$${n.toLocaleString()}`;
}

const CompanyRepDashboard: React.FC<CompanyRepDashboardProps> = ({ companyId, fallbackName }) => {
  const { reportError } = useErrorBoundary();

  const [company, setCompany] = useState<Company | null>(null);
  const [requests, setRequests] = useState<CompanyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Club profile modal
  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [companyResp, requestResp] = await Promise.all([
        c3Action('Company', 'fetch', {
          filter: `id == '${companyId}'`,
          include: 'this, name, industry',
          limit: 1,
        }),
        c3Action('CompanyRequest', 'fetch', {
          filter: `company.id == '${companyId}' && status != 'closed'`,
          include:
            'this, title, description, requestType, budget, deadline, status, ' +
            'submissions.this, submissions.status, submissions.submittedTimestamp, ' +
            'submissions.club.id, submissions.club.name',
          order: 'descending(deadline)',
          limit: 50,
        }),
      ]);
      setCompany(((companyResp?.objs ?? [])[0] as Company) ?? null);
      setRequests((requestResp?.objs ?? []) as CompanyRequest[]);
    } catch (e) {
      setError('Failed to load your company dashboard.');
      reportError(e);
    } finally {
      setLoading(false);
    }
  }, [companyId, reportError]);

  useEffect(() => {
    load();
  }, [load]);

  const companyName = company?.name ?? fallbackName ?? 'Your company';

  const totalProposals = useMemo(
    () => requests.reduce((sum, r) => sum + (r.submissions?.length ?? 0), 0),
    [requests],
  );

  if (loading) {
    return (
      <div className="flex min-h-full w-full items-center justify-center gap-[var(--c3-style-spacing-8)] p-[var(--c3-style-spacing-24)] text-[var(--c3-style-basic-fg-secondary)]">
        <Spinner size="lg" />
        <span className="text-c3-regular-body-p2">Loading your company dashboard…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full flex-col">
      <PageHeader
        title={companyName}
        description="Your open requests and the student organizations applying to them."
        badges={
          <Badge appearance="accent" variant="soft" leadingIcon={<Building2 />}>
            Company Rep
          </Badge>
        }
      />

      <div className="flex flex-col gap-[var(--c3-style-spacing-24)] p-[var(--c3-style-spacing-24)]">
        {error ? (
          <Alert variant="soft" appearance="destructive">
            <AlertAppearanceIcon appearance="destructive" />
            <AlertContent>
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
          {requests.length} open {requests.length === 1 ? 'request' : 'requests'} ·{' '}
          {totalProposals} {totalProposals === 1 ? 'proposal' : 'proposals'} received
        </p>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] py-16 text-center">
            <Inbox className="size-6 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
            <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
              No open requests
            </p>
            <p className="max-w-[420px] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              Your company has no open requests right now. Post one from the Company Requests tab to
              start receiving proposals from clubs.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--c3-style-spacing-16)]">
            {requests.map((req) => {
              const subs: ClubSubmission[] = req.submissions ?? [];
              return (
                <Card key={req.id} variant="elevated">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-[var(--c3-style-spacing-8)]">
                      {req.title}
                      {req.status ? (
                        <Badge
                          variant="soft"
                          appearance={STATUS_APPEARANCE[req.status] ?? 'secondary'}
                        >
                          {req.status}
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>
                      {req.requestType ? `${req.requestType} · ` : ''}
                      {money(req.budget)} · deadline {formatDate(req.deadline)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-[var(--c3-style-spacing-12)]">
                    <div className="flex items-center gap-[var(--c3-style-spacing-8)] text-[var(--c3-style-basic-fg-secondary)]">
                      <Users className="size-4" aria-hidden />
                      <span className="text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                        {subs.length}
                      </span>
                      <span className="text-c3-regular-body-p3">
                        {subs.length === 1 ? 'club has' : 'clubs have'} submitted a proposal
                      </span>
                    </div>

                    {subs.length > 0 ? (
                      <div className="flex flex-wrap gap-[var(--c3-style-spacing-8)]">
                        {subs.map((s) => (
                          <Button
                            key={s.id}
                            variant="outline"
                            appearance="accent"
                            size="sm"
                            leadingIcon={<CircleUserRound />}
                            trailingIcon={<ArrowRight />}
                            disabled={!s.club?.id}
                            onClick={() =>
                              s.club?.id
                                ? setSelectedClub({ id: s.club.id, name: s.club.name ?? 'Club' })
                                : undefined
                            }
                          >
                            {s.club?.name ?? 'Unknown club'}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-neutral)]">
                        No proposals yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ClubProfileModal
        club={selectedClub}
        onClose={() => setSelectedClub(null)}
      />
    </div>
  );
};

// --- Club profile modal ------------------------------------------------------

interface ClubProfileModalProps {
  club: { id: string; name: string } | null;
  onClose: () => void;
}

const ClubProfileModal: React.FC<ClubProfileModalProps> = ({ club, onClose }) => {
  const { reportError } = useErrorBoundary();
  const [detail, setDetail] = useState<Club | null>(null);
  const [latestEvent, setLatestEvent] = useState<ClubEvent | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!club) {
      setDetail(null);
      setLatestEvent(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [clubResp, eventResp] = await Promise.all([
          c3Action('Club', 'fetch', {
            filter: `id == '${club.id}'`,
            include:
              'this, name, mission, website, skills, ' +
              'instagramHandle, instagramUrl, instagramFollowers, instagramLatestPost, ' +
              'linkedinUrl, linkedinFollowers, linkedinLatestPost',
            limit: 1,
          }),
          c3Action('ClubEvent', 'fetch', {
            filter: `club.id == '${club.id}'`,
            include: 'this, name, description, eventDate, headcount, budget, cuisine, status',
            order: 'descending(eventDate)',
            limit: 1,
          }),
        ]);
        if (cancelled) return;
        setDetail(((clubResp?.objs ?? [])[0] as Club) ?? null);
        setLatestEvent(((eventResp?.objs ?? [])[0] as ClubEvent) ?? null);
      } catch (e) {
        if (!cancelled) reportError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [club, reportError]);

  const skills = detail?.skills ?? [];

  return (
    <Modal open={club !== null} onOpenChange={(o) => (!o ? onClose() : null)}>
      <ModalContent width={640}>
        <ModalHeader>
          <ModalTitle>{club?.name ?? 'Club profile'}</ModalTitle>
          <ModalSubtitle>Skills, latest event, and social snapshot</ModalSubtitle>
        </ModalHeader>
        <ModalBody>
          {loading ? (
            <div className="flex items-center justify-center gap-[var(--c3-style-spacing-8)] py-10 text-[var(--c3-style-basic-fg-secondary)]">
              <Spinner size="lg" />
              <span className="text-c3-regular-body-p2">Loading club profile…</span>
            </div>
          ) : (
            <div className="flex flex-col gap-[var(--c3-style-spacing-20)]">
              {detail?.mission ? (
                <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                  {detail.mission}
                </p>
              ) : null}

              {/* Skills */}
              <section className="flex flex-col gap-[var(--c3-style-spacing-8)]">
                <h3 className="flex items-center gap-[var(--c3-style-spacing-8)] text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                  <Sparkles className="size-4" aria-hidden />
                  Skills
                </h3>
                {skills.length > 0 ? (
                  <div className="flex flex-wrap gap-[var(--c3-style-spacing-6)]">
                    {skills.map((s) => (
                      <Badge key={s} variant="soft" appearance="accent">
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-neutral)]">
                    No skills listed yet.
                  </p>
                )}
              </section>

              {/* Latest event */}
              <section className="flex flex-col gap-[var(--c3-style-spacing-8)]">
                <h3 className="flex items-center gap-[var(--c3-style-spacing-8)] text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                  <CalendarDays className="size-4" aria-hidden />
                  Latest event
                </h3>
                {latestEvent ? (
                  <div className="rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-secondary)] p-[var(--c3-style-spacing-12)]">
                    <div className="flex flex-wrap items-center gap-[var(--c3-style-spacing-8)]">
                      <span className="text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                        {latestEvent.name}
                      </span>
                      {latestEvent.status ? (
                        <Badge variant="outline" appearance="secondary">
                          {latestEvent.status}
                        </Badge>
                      ) : null}
                    </div>
                    {latestEvent.description ? (
                      <p className="mt-[var(--c3-style-spacing-6)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                        {latestEvent.description}
                      </p>
                    ) : null}
                    <p className="mt-[var(--c3-style-spacing-6)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                      {formatDate(latestEvent.eventDate)}
                      {typeof latestEvent.headcount === 'number'
                        ? ` · ${latestEvent.headcount} attendees`
                        : ''}
                      {latestEvent.cuisine ? ` · ${latestEvent.cuisine}` : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-neutral)]">
                    No events on record yet.
                  </p>
                )}
              </section>

              {/* Social snapshot */}
              <section className="flex flex-col gap-[var(--c3-style-spacing-8)]">
                <h3 className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                  Social snapshot
                </h3>
                <div className="grid grid-cols-1 gap-[var(--c3-style-spacing-12)] md:grid-cols-2">
                  <InstagramSnapshot club={detail} />
                  <LinkedInSnapshot club={detail} />
                </div>
              </section>
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

// --- Social snapshot cards ---------------------------------------------------

const InstagramSnapshot: React.FC<{ club: Club | null }> = ({ club }) => {
  const has = Boolean(club?.instagramHandle || club?.instagramUrl || club?.instagramLatestPost);
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)]">
      <div className="flex items-center gap-[var(--c3-style-spacing-8)] bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#FCAF45] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-8)] text-white">
        <Instagram className="size-4" aria-hidden />
        <span className="text-c3-bold-label-l3">
          {club?.instagramHandle ?? 'Instagram'}
        </span>
        {typeof club?.instagramFollowers === 'number' ? (
          <span className="ml-auto text-c3-regular-body-p3 opacity-90">
            {club.instagramFollowers.toLocaleString()} followers
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-[var(--c3-style-spacing-8)] p-[var(--c3-style-spacing-12)]">
        {has ? (
          <>
            <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              {club?.instagramLatestPost ?? 'Latest post unavailable.'}
            </p>
            {club?.instagramUrl ? (
              <a
                href={club.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-auto text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-accent)] underline"
              >
                View profile
              </a>
            ) : null}
          </>
        ) : (
          <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-neutral)]">
            No Instagram on file.
          </p>
        )}
      </div>
    </div>
  );
};

const LinkedInSnapshot: React.FC<{ club: Club | null }> = ({ club }) => {
  const has = Boolean(club?.linkedinUrl || club?.linkedinLatestPost);
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)]">
      <div className="flex items-center gap-[var(--c3-style-spacing-8)] bg-[#0A66C2] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-8)] text-white">
        <Linkedin className="size-4" aria-hidden />
        <span className="text-c3-bold-label-l3">LinkedIn</span>
        {typeof club?.linkedinFollowers === 'number' ? (
          <span className="ml-auto text-c3-regular-body-p3 opacity-90">
            {club.linkedinFollowers.toLocaleString()} followers
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-[var(--c3-style-spacing-8)] p-[var(--c3-style-spacing-12)]">
        {has ? (
          <>
            <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              {club?.linkedinLatestPost ?? 'Latest post unavailable.'}
            </p>
            {club?.linkedinUrl ? (
              <a
                href={club.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-auto text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-accent)] underline"
              >
                View page
              </a>
            ) : null}
          </>
        ) : (
          <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-neutral)]">
            No LinkedIn on file.
          </p>
        )}
      </div>
    </div>
  );
};

export default CompanyRepDashboard;

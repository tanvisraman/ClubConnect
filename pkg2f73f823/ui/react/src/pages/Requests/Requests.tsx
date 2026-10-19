/*
 * Company Requests board — the inbound complement to sponsorship outreach.
 *
 * Companies post needs (CompanyRequest); clubs browse and apply (ClubSubmission).
 * The board is role-aware: a Club Officer sees open requests and can apply; a
 * Company Rep sees only their own company's requests and the submissions against
 * them. This models the platform's row-level, multi-tenant visibility.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox,
  RefreshCw,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Send,
  CheckCircle2,
  Plus,
} from 'lucide-react';

import { c3Action, c3CreateAction } from '@/c3Action';
import type { ClubSubmission, CompanyRequest } from '@/Interfaces';
import { useActiveUser } from '@/context/ActiveUser';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
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
  ModalFooter,
  ModalFooterActions,
} from '@/components/ui/modal';

function statusAppearance(status?: string): BadgeAppearance {
  switch (status) {
    case 'accepted':
    case 'open':
      return 'success';
    case 'shortlisted':
    case 'reviewing':
      return 'accent';
    case 'declined':
    case 'closed':
      return 'danger';
    default:
      return 'secondary';
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface NewRequestForm {
  title: string;
  description: string;
  requestType: string;
  budget: string;
  deadline: string;
  targetCategories: string;
}

const EMPTY_REQUEST_FORM: NewRequestForm = {
  title: '',
  description: '',
  requestType: '',
  budget: '',
  deadline: '',
  targetCategories: '',
};

const Requests: React.FC = () => {
  const { activeUser, activeClubId, activeCompanyId } = useActiveUser();
  const { reportError } = useErrorBoundary();
  const isClub = !!activeClubId;
  const isCompany = !!activeCompanyId;

  const [requests, setRequests] = useState<CompanyRequest[]>([]);
  const [mySubs, setMySubs] = useState<ClubSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [applyFor, setApplyFor] = useState<CompanyRequest | null>(null);
  const [pitch, setPitch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Company-rep "post a request" form
  const [newRequest, setNewRequest] = useState<NewRequestForm | null>(null);
  const [posting, setPosting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isCompany) {
        const resp = await c3Action('CompanyRequest', 'fetch', {
          filter: `company.id == '${activeCompanyId}'`,
          include:
            'this, company.name, submissions.this, submissions.pitch, submissions.status, ' +
            'submissions.club.name',
          order: 'descending(meta.created)',
          limit: -1,
        });
        setRequests((resp?.objs ?? []) as CompanyRequest[]);
        setMySubs([]);
      } else {
        // Club officer (or a read-only viewer): show open requests.
        const [reqResp, subResp] = await Promise.all([
          c3Action('CompanyRequest', 'fetch', {
            filter: "status != 'closed'",
            include: 'this, company.name',
            order: 'ascending(deadline)',
            limit: -1,
          }),
          isClub
            ? c3Action('ClubSubmission', 'fetch', {
                filter: `club.id == '${activeClubId}'`,
                include: 'this, request.id, request.title',
                limit: -1,
              })
            : Promise.resolve({ objs: [] }),
        ]);
        setRequests((reqResp?.objs ?? []) as CompanyRequest[]);
        setMySubs((subResp?.objs ?? []) as ClubSubmission[]);
      }
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Failed to load company requests.');
    } finally {
      setLoading(false);
    }
  }, [isCompany, isClub, activeCompanyId, activeClubId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const subByRequest = useMemo(() => {
    const map: Record<string, ClubSubmission> = {};
    mySubs.forEach((s) => {
      if (s.request?.id) map[s.request.id] = s;
    });
    return map;
  }, [mySubs]);

  const openApply = useCallback((req: CompanyRequest) => {
    setApplyFor(req);
    setPitch('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!applyFor || !activeClubId) return;
    setSubmitting(true);
    setError(null);
    try {
      await c3CreateAction('ClubSubmission', 'upsert', {
        id: `sub_${applyFor.id}_${activeClubId}`,
        request: { id: applyFor.id },
        club: { id: activeClubId },
        pitch,
        status: 'submitted',
        submittedTimestamp: new Date().toISOString(),
      });
      setApplyFor(null);
      await loadAll();
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Failed to submit your application.');
    } finally {
      setSubmitting(false);
    }
  }, [applyFor, activeClubId, pitch, loadAll]);

  const handlePostRequest = useCallback(async () => {
    if (!newRequest || !activeCompanyId) return;
    setPosting(true);
    setError(null);
    try {
      await c3CreateAction('CompanyRequest', 'upsert', {
        id: `req_${activeCompanyId}_${Date.now().toString(36)}`,
        company: { id: activeCompanyId },
        title: newRequest.title.trim(),
        description: newRequest.description.trim(),
        requestType: newRequest.requestType.trim() || undefined,
        budget: newRequest.budget ? Number(newRequest.budget) : undefined,
        deadline: newRequest.deadline || undefined,
        targetCategories: newRequest.targetCategories
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        status: 'open',
      });
      setNewRequest(null);
      await loadAll();
    } catch (e) {
      setError('Failed to post your request.');
      reportError(e);
    } finally {
      setPosting(false);
    }
  }, [newRequest, activeCompanyId, loadAll, reportError]);

  return (
    <div className="flex min-h-full w-full flex-col">
      <PageHeader
        title="Company Requests"
        description={
          isCompany
            ? 'Opportunities your company has posted and the clubs that applied'
            : 'Open opportunities posted by companies — apply your club'
        }
        badges={
          <Badge appearance="accent" variant="soft" leadingIcon={<Inbox />}>
            {isCompany ? 'Company view' : 'Club view'}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-[var(--c3-style-spacing-8)]">
            <Button
              variant="outline"
              appearance="secondary"
              leadingIcon={<RefreshCw />}
              onClick={loadAll}
              disabled={loading}
            >
              Refresh
            </Button>
            {isCompany ? (
              <Button
                appearance="accent"
                leadingIcon={<Plus />}
                onClick={() => setNewRequest({ ...EMPTY_REQUEST_FORM })}
              >
                Post a request
              </Button>
            ) : null}
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

        {!isClub && !isCompany ? (
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>Read-only view</AlertTitle>
              <AlertDescription>
                You are acting as {activeUser?.name ?? 'a platform user'} ({activeUser?.role}).
                Switch to a Club Officer to apply, or a Company Rep to manage posted requests.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-[var(--c3-style-spacing-8)] py-16 text-[var(--c3-style-basic-fg-secondary)]">
            <Spinner size="lg" />
            <span className="text-c3-regular-body-p2">Loading requests…</span>
          </div>
        ) : null}

        {!loading && requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] py-16 text-center">
            <Inbox className="size-6 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
            <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
              No requests
            </p>
            <p className="max-w-[420px] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              {isCompany
                ? 'Your company has not posted any requests yet.'
                : 'There are no open company requests right now.'}
            </p>
          </div>
        ) : null}

        {requests.map((req) => {
          const existing = subByRequest[req.id];
          return (
            <Card key={req.id} variant="elevated">
              <CardHeader>
                <CardTitle>{req.title}</CardTitle>
                <CardDescription className="flex items-center gap-[var(--c3-style-spacing-6)]">
                  <Building2 className="size-4" aria-hidden />
                  {req.company?.name ?? ''}
                </CardDescription>
                <CardAction>
                  {req.requestType ? (
                    <Badge variant="outline" appearance="secondary">
                      {req.requestType}
                    </Badge>
                  ) : null}
                  <Badge appearance={statusAppearance(req.status)} variant="soft">
                    {req.status ?? 'open'}
                  </Badge>
                </CardAction>
              </CardHeader>

              <CardContent className="flex flex-col gap-[var(--c3-style-spacing-12)]">
                {req.description ? (
                  <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                    {req.description}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-[var(--c3-style-spacing-16)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                  {typeof req.budget === 'number' ? (
                    <span className="inline-flex items-center gap-[var(--c3-style-spacing-6)]">
                      <CircleDollarSign className="size-4" aria-hidden />$
                      {req.budget.toLocaleString()}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-[var(--c3-style-spacing-6)]">
                    <CalendarDays className="size-4" aria-hidden />
                    Due {formatDate(req.deadline)}
                  </span>
                  {(req.targetCategories ?? []).slice(0, 4).map((c) => (
                    <Badge key={c} variant="outline" appearance="secondary">
                      {c}
                    </Badge>
                  ))}
                </div>

                {/* Company view: show the submissions received */}
                {isCompany ? (
                  <div className="flex flex-col gap-[var(--c3-style-spacing-8)]">
                    <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">
                      {(req.submissions?.length ?? 0)} club submission
                      {(req.submissions?.length ?? 0) === 1 ? '' : 's'}
                    </span>
                    {(req.submissions ?? []).map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-col gap-[var(--c3-style-spacing-4)] rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-secondary)] p-[var(--c3-style-spacing-12)]"
                      >
                        <div className="flex items-center justify-between gap-[var(--c3-style-spacing-8)]">
                          <span className="text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                            {s.club?.name ?? 'Club'}
                          </span>
                          <Badge appearance={statusAppearance(s.status)} variant="soft">
                            {s.status ?? 'submitted'}
                          </Badge>
                        </div>
                        {s.pitch ? (
                          <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                            {s.pitch}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>

              {/* Club view: apply action */}
              {isClub ? (
                <CardFooter bordered className="justify-end">
                  {existing ? (
                    <span className="inline-flex items-center gap-[var(--c3-style-spacing-6)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-success)]">
                      <CheckCircle2 className="size-4" aria-hidden />
                      Applied — {existing.status ?? 'submitted'}
                    </span>
                  ) : (
                    <Button
                      appearance="accent"
                      leadingIcon={<Send />}
                      onClick={() => openApply(req)}
                    >
                      Apply
                    </Button>
                  )}
                </CardFooter>
              ) : null}
            </Card>
          );
        })}
      </div>

      {/* Apply modal */}
      <Modal open={applyFor !== null} onOpenChange={(o) => (!o ? setApplyFor(null) : null)}>
        <ModalContent width={560}>
          <ModalHeader>
            <ModalTitle>Apply to {applyFor?.title}</ModalTitle>
            <ModalSubtitle>{applyFor?.company?.name ?? ''}</ModalSubtitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
              <label
                htmlFor="pitch-input"
                className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
              >
                Your pitch
              </label>
              <Textarea
                id="pitch-input"
                value={pitch}
                rows={6}
                placeholder="Why is your club the right fit? Highlight your members, past events, and relevant experience."
                onChange={(e) => setPitch(e.target.value)}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalFooterActions>
              <Button
                variant="outline"
                appearance="secondary"
                onClick={() => setApplyFor(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                appearance="accent"
                leadingIcon={<Send />}
                loading={submitting}
                disabled={pitch.trim().length === 0}
                onClick={handleSubmit}
              >
                Submit application
              </Button>
            </ModalFooterActions>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Post-a-request modal (company reps) */}
      <Modal open={newRequest !== null} onOpenChange={(o) => (!o ? setNewRequest(null) : null)}>
        <ModalContent width={560}>
          <ModalHeader>
            <ModalTitle>Post a request</ModalTitle>
            <ModalSubtitle>
              Describe the opportunity — clubs will see it and can apply.
            </ModalSubtitle>
          </ModalHeader>
          <ModalBody>
            {newRequest ? (
              <div className="flex flex-col gap-[var(--c3-style-spacing-12)]">
                <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                  <label
                    htmlFor="req-title"
                    className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                  >
                    Title
                  </label>
                  <Input
                    id="req-title"
                    value={newRequest.title}
                    placeholder="e.g. Seeking a student club to host a recruiting event"
                    onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                  <label
                    htmlFor="req-desc"
                    className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                  >
                    Description
                  </label>
                  <Textarea
                    id="req-desc"
                    rows={4}
                    value={newRequest.description}
                    placeholder="What you're looking for, who it's for, and what you're offering."
                    onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-[var(--c3-style-spacing-12)] md:grid-cols-2">
                  <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                    <label
                      htmlFor="req-type"
                      className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                    >
                      Request type
                    </label>
                    <Input
                      id="req-type"
                      value={newRequest.requestType}
                      placeholder="e.g. Sponsorship, Recruiting, Partnership"
                      onChange={(e) =>
                        setNewRequest({ ...newRequest, requestType: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                    <label
                      htmlFor="req-budget"
                      className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                    >
                      Budget ($)
                    </label>
                    <Input
                      id="req-budget"
                      type="number"
                      min={0}
                      value={newRequest.budget}
                      onChange={(e) => setNewRequest({ ...newRequest, budget: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                    <label
                      htmlFor="req-deadline"
                      className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                    >
                      Deadline
                    </label>
                    <Input
                      id="req-deadline"
                      type="date"
                      value={newRequest.deadline}
                      onChange={(e) => setNewRequest({ ...newRequest, deadline: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                    <label
                      htmlFor="req-cats"
                      className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                    >
                      Target categories (comma-separated)
                    </label>
                    <Input
                      id="req-cats"
                      value={newRequest.targetCategories}
                      placeholder="Technology, Engineering"
                      onChange={(e) =>
                        setNewRequest({ ...newRequest, targetCategories: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <ModalFooterActions>
              <Button
                variant="outline"
                appearance="secondary"
                onClick={() => setNewRequest(null)}
                disabled={posting}
              >
                Cancel
              </Button>
              <Button
                appearance="accent"
                leadingIcon={<Plus />}
                loading={posting}
                disabled={!newRequest || newRequest.title.trim().length === 0}
                onClick={handlePostRequest}
              >
                Post request
              </Button>
            </ModalFooterActions>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Requests;

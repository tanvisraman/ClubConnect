/*
 * Drafts tab — the human-in-the-loop review surface for the outreach agent.
 *
 * Shows one card per ranked OutreachMessage (warm-intro connection, fit score,
 * rationale, editable subject/body) and the approve → mark-sent gate. Nothing
 * is "sent" (simulated in this MVP) without an explicit approval.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Sparkles,
  Building2,
  UserRound,
  Mail,
  Send,
  CheckCircle2,
} from 'lucide-react';

import { c3Action, c3CreateAction, c3MemberAction } from '@/c3Action';
import type { OutreachMessage } from '@/Interfaces';
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

interface DraftsTabProps {
  campaignId: string;
  clubName: string;
  /** Bumped by the shell after the agent re-runs so this tab refetches. */
  reloadToken: number;
  generating: boolean;
  onGenerate: () => void;
  onError: (message: string | null) => void;
}

function scoreAppearance(score?: number): BadgeAppearance {
  if (score == null) return 'secondary';
  if (score >= 90) return 'success';
  if (score >= 75) return 'accent';
  return 'secondary';
}

function statusAppearance(status?: string): BadgeAppearance {
  switch (status) {
    case 'approved':
      return 'warning';
    case 'sent':
      return 'success';
    default:
      return 'secondary';
  }
}

function statusLabel(status?: string): string {
  switch (status) {
    case 'approved':
      return 'Approved — ready to send';
    case 'sent':
      return 'Sent';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Draft';
  }
}

const DraftsTab: React.FC<DraftsTabProps> = ({
  campaignId,
  clubName,
  reloadToken,
  generating,
  onGenerate,
  onError,
}) => {
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const seedDrafts = useCallback((msgs: OutreachMessage[]) => {
    const next: Record<string, { subject: string; body: string }> = {};
    msgs.forEach((m) => {
      next[m.id] = { subject: m.draftSubject ?? '', body: m.draftBody ?? '' };
    });
    setDrafts(next);
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const resp = await c3Action('OutreachMessage', 'fetch', {
        filter: `campaign.id == '${campaignId}'`,
        include:
          'this, company.name, company.industry, company.headquarters, company.website, ' +
          'warmIntroContact.name, warmIntroContact.positionTitle, warmIntroContact.seniority, ' +
          'warmIntroContact.linkedInUrl, warmIntroContact.isDecisionMaker',
        order: 'descending(matchScore)',
        limit: 50,
      });
      const msgs = (resp?.objs ?? []) as OutreachMessage[];
      setMessages(msgs);
      seedDrafts(msgs);
    } catch (e) {
      onError(typeof e === 'string' ? e : 'Failed to load outreach drafts.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, seedDrafts, onError]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages, reloadToken]);

  const refreshMessage = useCallback((updated: OutreachMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
  }, []);

  const handleApprove = useCallback(
    async (msg: OutreachMessage) => {
      setBusyId(msg.id);
      onError(null);
      try {
        const edited = drafts[msg.id];
        if (edited && (edited.subject !== msg.draftSubject || edited.body !== msg.draftBody)) {
          await c3CreateAction('OutreachMessage', 'upsert', {
            id: msg.id,
            draftSubject: edited.subject,
            draftBody: edited.body,
          });
        }
        await c3MemberAction('OutreachMessage', 'approve', { id: msg.id }, []);
        refreshMessage({
          id: msg.id,
          status: 'approved',
          draftSubject: edited?.subject ?? msg.draftSubject,
          draftBody: edited?.body ?? msg.draftBody,
        });
      } catch (e) {
        onError(typeof e === 'string' ? e : 'Failed to approve this draft.');
      } finally {
        setBusyId(null);
      }
    },
    [drafts, refreshMessage, onError],
  );

  const handleSend = useCallback(
    async (msg: OutreachMessage) => {
      setBusyId(msg.id);
      onError(null);
      try {
        await c3MemberAction('OutreachMessage', 'markSent', { id: msg.id }, []);
        refreshMessage({ id: msg.id, status: 'sent' });
      } catch (e) {
        onError(typeof e === 'string' ? e : 'Failed to mark this message as sent.');
      } finally {
        setBusyId(null);
      }
    },
    [refreshMessage, onError],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-[var(--c3-style-spacing-8)] py-16 text-[var(--c3-style-basic-fg-secondary)]">
        <Spinner size="lg" />
        <span className="text-c3-regular-body-p2">Loading drafts…</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] py-16 text-center">
        <Sparkles className="size-6 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
        <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">No drafts yet</p>
        <p className="max-w-[420px] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
          Run the outreach agent to rank companies where {clubName} has alumni connections and draft
          a warm-intro email for each. Every ranked company also lands in the Pipeline tab.
        </p>
        <Button
          appearance="accent"
          leadingIcon={<Sparkles />}
          loading={generating}
          onClick={onGenerate}
          className="mt-2"
        >
          Generate ranked drafts
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--c3-style-spacing-16)]">
      {messages.map((msg, idx) => {
        const draft = drafts[msg.id] ?? {
          subject: msg.draftSubject ?? '',
          body: msg.draftBody ?? '',
        };
        const isBusy = busyId === msg.id;
        const warm = msg.warmIntroContact;
        return (
          <Card key={msg.id} variant="elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-[var(--c3-style-spacing-8)]">
                <span className="inline-flex size-6 items-center justify-center rounded-[var(--c3-style-border-radius-rounded)] bg-[var(--c3-style-basic-bg-secondary)] text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  {idx + 1}
                </span>
                <Building2 className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                {msg.company?.name ?? 'Company'}
              </CardTitle>
              <CardDescription>
                {[msg.company?.industry, msg.company?.headquarters].filter(Boolean).join(' · ')}
              </CardDescription>
              <CardAction>
                <Badge appearance={scoreAppearance(msg.matchScore)} variant="solid">
                  {Math.round(msg.matchScore ?? 0)} fit
                </Badge>
                <Badge appearance={statusAppearance(msg.status)} variant="soft">
                  {statusLabel(msg.status)}
                </Badge>
              </CardAction>
            </CardHeader>

            <CardContent className="flex flex-col gap-[var(--c3-style-spacing-12)]">
              <div className="flex items-start gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-accent)] p-[var(--c3-style-spacing-12)]">
                <UserRound
                  className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-accent)]"
                  aria-hidden
                />
                <div className="min-w-0">
                  {warm ? (
                    <>
                      <p className="text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-accent)]">
                        Warm intro via {warm.name}
                        {warm.isDecisionMaker ? ' (decision-maker)' : ''}
                      </p>
                      <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                        {[warm.positionTitle, warm.seniority].filter(Boolean).join(' · ')}
                      </p>
                    </>
                  ) : (
                    <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                      No alumni connection — approach the partnerships team directly.
                    </p>
                  )}
                </div>
              </div>

              {msg.matchRationale ? (
                <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                  <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">
                    Why:{' '}
                  </span>
                  {msg.matchRationale}
                </p>
              ) : null}

              <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                <label
                  htmlFor={`subject-${msg.id}`}
                  className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                >
                  Subject
                </label>
                <input
                  id={`subject-${msg.id}`}
                  value={draft.subject}
                  disabled={msg.status === 'sent'}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [msg.id]: { ...draft, subject: e.target.value },
                    }))
                  }
                  className="w-full rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-8)] font-sans text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)] outline-none disabled:opacity-60"
                />
              </div>

              <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                <label
                  htmlFor={`body-${msg.id}`}
                  className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                >
                  Draft email
                </label>
                <Textarea
                  id={`body-${msg.id}`}
                  value={draft.body}
                  rows={8}
                  disabled={msg.status === 'sent'}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [msg.id]: { ...draft, body: e.target.value },
                    }))
                  }
                />
              </div>
            </CardContent>

            <CardFooter bordered className="justify-between">
              <span className="inline-flex items-center gap-[var(--c3-style-spacing-6)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                <Mail className="size-4" aria-hidden />
                {msg.status === 'sent'
                  ? 'This outreach has been sent.'
                  : 'Review and edit the draft before approving.'}
              </span>
              <div className="flex items-center gap-[var(--c3-style-spacing-8)]">
                {msg.status !== 'sent' ? (
                  <Button
                    variant="outline"
                    appearance="success"
                    leadingIcon={<CheckCircle2 />}
                    loading={isBusy}
                    disabled={busyId !== null && !isBusy}
                    onClick={() => handleApprove(msg)}
                  >
                    {msg.status === 'approved' ? 'Re-approve' : 'Approve'}
                  </Button>
                ) : null}
                <Button
                  appearance="accent"
                  leadingIcon={<Send />}
                  loading={isBusy}
                  disabled={
                    msg.status === 'sent' || msg.status !== 'approved' || (busyId !== null && !isBusy)
                  }
                  onClick={() => handleSend(msg)}
                >
                  {msg.status === 'sent' ? 'Sent' : 'Mark as sent'}
                </Button>
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
};

export default DraftsTab;

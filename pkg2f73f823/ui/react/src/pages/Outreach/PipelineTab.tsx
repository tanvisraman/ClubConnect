/*
 * Pipeline tab — the sponsorship pipeline tracker.
 *
 * A spreadsheet-style grid of SponsorProspect rows (one per company being worked
 * toward a sponsorship), plus a summary bar with a committed-vs-goal thermometer
 * and per-stage counts. Officers move a prospect through stages inline
 * (advanceStage), record a secured commitment (recordCommitment), and add their
 * own prospects by hand. The outreach agent also drops every ranked company here.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ChevronDown, Target, Building2, MoreHorizontal } from 'lucide-react';

import { c3Action, c3CreateAction, c3MemberAction } from '@/c3Action';
import type { Company, SponsorProspect, SponsorProspectStage } from '@/Interfaces';
import {
  DataGrid,
  DataGridHeader,
  DataGridBody,
  DataGridRow,
  DataGridHead,
  DataGridCell,
  DataGridRowActions,
  type SortDirection,
} from '@/components/ui/data-grid';
import { Badge, type BadgeAppearance } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { InputSearch } from '@/components/ui/input-search';
import { Combobox } from '@/components/ui/combobox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalSubtitle,
  ModalBody,
  ModalFooter,
  ModalFooterActions,
  ModalClose,
} from '@/components/ui/modal';

interface PipelineTabProps {
  campaignId: string;
  goalAmount?: number;
  /** Candidate companies for the manual "add prospect" form. */
  companies: Company[];
  /** Bumped by the shell after the agent re-runs so this tab refetches. */
  reloadToken: number;
  onError: (message: string | null) => void;
}

interface StageMeta {
  key: SponsorProspectStage;
  label: string;
  appearance: BadgeAppearance;
}

const STAGES: StageMeta[] = [
  { key: 'prospect', label: 'Prospect', appearance: 'secondary' },
  { key: 'contacted', label: 'Contacted', appearance: 'info' },
  { key: 'replied', label: 'Replied', appearance: 'accent' },
  { key: 'meeting', label: 'Meeting', appearance: 'warning' },
  { key: 'committed', label: 'Committed', appearance: 'success' },
  { key: 'declined', label: 'Declined', appearance: 'danger' },
];

const STAGE_INDEX: Record<string, number> = STAGES.reduce(
  (acc, s, i) => ({ ...acc, [s.key]: i }),
  {} as Record<string, number>,
);

function stageMeta(stage?: string): StageMeta {
  return STAGES.find((s) => s.key === stage) ?? STAGES[0];
}

const TIERS = ['Gold', 'Silver', 'Bronze'];
/** Active (forward-path) stages whose ask dollars are "open" pipeline. */
const ACTIVE_STAGES: SponsorProspectStage[] = ['prospect', 'contacted', 'replied', 'meeting'];

function money(n?: number): string {
  if (!n) return '$0';
  return `$${Math.round(n).toLocaleString()}`;
}

function fitAppearance(score?: number): BadgeAppearance {
  if (score == null) return 'secondary';
  if (score >= 90) return 'success';
  if (score >= 75) return 'accent';
  return 'secondary';
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type SortKey = 'company' | 'stage' | 'ask' | 'committed' | 'fit';

const PROSPECT_INCLUDE =
  'this, company.name, company.industry, campaign.id, primaryContact.name, primaryContact.title';

const PipelineTab: React.FC<PipelineTabProps> = ({
  campaignId,
  goalAmount,
  companies,
  reloadToken,
  onError,
}) => {
  const [prospects, setProspects] = useState<SponsorProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | SponsorProspectStage>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'fit',
    dir: 'desc',
  });

  // Add-prospect modal state.
  const [addOpen, setAddOpen] = useState(false);
  const [addCompanyId, setAddCompanyId] = useState<string | null>(null);
  const [addTier, setAddTier] = useState<string | null>('Silver');
  const [addAsk, setAddAsk] = useState<string>('');
  const [addOwner, setAddOwner] = useState<string>('');
  const [addNextAction, setAddNextAction] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const loadProspects = useCallback(async () => {
    try {
      const resp = await c3Action('SponsorProspect', 'fetch', {
        filter: `campaign.id == '${campaignId}'`,
        include: PROSPECT_INCLUDE,
        order: 'descending(fitScore)',
        limit: 200,
      });
      setProspects((resp?.objs ?? []) as SponsorProspect[]);
    } catch (e) {
      onError(typeof e === 'string' ? e : 'Failed to load the sponsorship pipeline.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, onError]);

  useEffect(() => {
    loadProspects();
  }, [loadProspects, reloadToken]);

  const upsertRow = useCallback((updated: SponsorProspect) => {
    setProspects((prev) => {
      const exists = prev.some((p) => p.id === updated.id);
      return exists
        ? prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
        : [...prev, updated];
    });
  }, []);

  const handleAdvance = useCallback(
    async (prospect: SponsorProspect, stage: SponsorProspectStage) => {
      if (prospect.stage === stage) return;
      setBusyId(prospect.id);
      onError(null);
      try {
        const updated = (await c3MemberAction('SponsorProspect', 'advanceStage', { id: prospect.id }, [
          stage,
          'club-officer',
        ])) as SponsorProspect;
        upsertRow(updated ?? { ...prospect, stage });
      } catch (e) {
        onError(typeof e === 'string' ? e : 'Failed to update the prospect stage.');
      } finally {
        setBusyId(null);
      }
    },
    [upsertRow, onError],
  );

  const handleCommit = useCallback(
    async (prospect: SponsorProspect) => {
      const amount = prospect.committedAmount ?? prospect.askAmount ?? 0;
      setBusyId(prospect.id);
      onError(null);
      try {
        const updated = (await c3MemberAction(
          'SponsorProspect',
          'recordCommitment',
          { id: prospect.id },
          [amount, 'club-officer'],
        )) as SponsorProspect;
        upsertRow(updated ?? { ...prospect, stage: 'committed', committedAmount: amount });
      } catch (e) {
        onError(typeof e === 'string' ? e : 'Failed to record the commitment.');
      } finally {
        setBusyId(null);
      }
    },
    [upsertRow, onError],
  );

  const resetAddForm = useCallback(() => {
    setAddCompanyId(null);
    setAddTier('Silver');
    setAddAsk('');
    setAddOwner('');
    setAddNextAction('');
  }, []);

  const handleAddProspect = useCallback(async () => {
    if (!addCompanyId) {
      onError('Pick a company to add to the pipeline.');
      return;
    }
    setSaving(true);
    onError(null);
    try {
      const id = `${campaignId}_prospect_${addCompanyId}`;
      const askNum = addAsk ? Number(addAsk) : undefined;
      await c3CreateAction('SponsorProspect', 'upsert', {
        id,
        company: { id: addCompanyId },
        campaign: { id: campaignId },
        stage: 'prospect',
        targetTier: addTier ?? undefined,
        askAmount: Number.isFinite(askNum) ? askNum : undefined,
        owner: addOwner || undefined,
        nextAction: addNextAction || undefined,
      });
      const resp = await c3Action('SponsorProspect', 'fetch', {
        filter: `id == '${id}'`,
        include: PROSPECT_INCLUDE,
        limit: 1,
      });
      const row = (resp?.objs?.[0] as SponsorProspect) ?? null;
      if (row) upsertRow(row);
      setAddOpen(false);
      resetAddForm();
    } catch (e) {
      onError(typeof e === 'string' ? e : 'Failed to add the prospect.');
    } finally {
      setSaving(false);
    }
  }, [addCompanyId, addTier, addAsk, addOwner, addNextAction, campaignId, upsertRow, resetAddForm, onError]);

  // -------- Derived summary + filtered/sorted rows --------

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    let committed = 0;
    let openAsk = 0;
    prospects.forEach((p) => {
      counts[p.stage] = (counts[p.stage] ?? 0) + 1;
      if (p.stage === 'committed') committed += p.committedAmount ?? 0;
      if (ACTIVE_STAGES.includes(p.stage)) openAsk += p.askAmount ?? 0;
    });
    const goal = goalAmount ?? 0;
    const pct = goal > 0 ? Math.min(100, (committed / goal) * 100) : 0;
    return { counts, committed, openAsk, goal, pct };
  }, [prospects, goalAmount]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = prospects.filter((p) => {
      if (stageFilter !== 'all' && p.stage !== stageFilter) return false;
      if (!q) return true;
      return (
        (p.company?.name ?? '').toLowerCase().includes(q) ||
        (p.owner ?? '').toLowerCase().includes(q) ||
        (p.targetTier ?? '').toLowerCase().includes(q)
      );
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    const cmp = (a: SponsorProspect, b: SponsorProspect): number => {
      switch (sort.key) {
        case 'company':
          return (a.company?.name ?? '').localeCompare(b.company?.name ?? '') * dir;
        case 'stage':
          return ((STAGE_INDEX[a.stage] ?? 0) - (STAGE_INDEX[b.stage] ?? 0)) * dir;
        case 'ask':
          return ((a.askAmount ?? 0) - (b.askAmount ?? 0)) * dir;
        case 'committed':
          return ((a.committedAmount ?? 0) - (b.committedAmount ?? 0)) * dir;
        case 'fit':
        default:
          return ((a.fitScore ?? 0) - (b.fitScore ?? 0)) * dir;
      }
    };
    return [...filtered].sort(cmp);
  }, [prospects, search, stageFilter, sort]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    );
  }, []);

  const sortDir = (key: SortKey): SortDirection => (sort.key === key ? sort.dir : null);

  // Companies not yet in the pipeline, for the add-prospect combobox.
  const availableCompanyOptions = useMemo(() => {
    const taken = new Set(prospects.map((p) => p.company?.id).filter(Boolean));
    return companies
      .filter((c) => !taken.has(c.id))
      .map((c) => ({ value: c.id, label: c.name ?? c.id }));
  }, [companies, prospects]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-[var(--c3-style-spacing-8)] py-16 text-[var(--c3-style-basic-fg-secondary)]">
        <Spinner size="lg" />
        <span className="text-c3-regular-body-p2">Loading pipeline…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--c3-style-spacing-16)]">
      {/* Summary bar: goal thermometer + stage counts */}
      <div className="grid grid-cols-1 gap-[var(--c3-style-spacing-16)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] p-[var(--c3-style-spacing-16)]">
          <div className="flex items-center gap-[var(--c3-style-spacing-6)] text-[var(--c3-style-basic-fg-secondary)]">
            <Target className="size-4" aria-hidden />
            <span className="text-c3-bold-label-l3">Committed vs. goal</span>
          </div>
          <div className="flex items-baseline gap-[var(--c3-style-spacing-6)]">
            <span className="text-c3-bold-heading-h3 text-[var(--c3-style-basic-fg-primary)]">
              {money(summary.committed)}
            </span>
            <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              of {money(summary.goal)} goal
            </span>
          </div>
          <Progress value={summary.pct} size="lg" />
          <div className="flex items-center justify-between text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
            <span>{Math.round(summary.pct)}% of goal</span>
            <span>{money(summary.openAsk)} open ask in pipeline</span>
          </div>
        </div>

        <div className="flex flex-wrap content-start gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] p-[var(--c3-style-spacing-16)]">
          <span className="w-full text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            Pipeline by stage
          </span>
          {STAGES.map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-[var(--c3-style-spacing-6)] rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] px-[var(--c3-style-spacing-8)] py-[var(--c3-style-spacing-6)]"
            >
              <Badge appearance={s.appearance} variant="soft">
                {s.label}
              </Badge>
              <span className="text-c3-bold-body-p2 tabular-nums text-[var(--c3-style-basic-fg-primary)]">
                {summary.counts[s.key] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar: search + stage filter + add */}
      <div className="flex flex-wrap items-center gap-[var(--c3-style-spacing-8)]">
        <div className="min-w-[220px] flex-1">
          <InputSearch
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder="Search company, owner, tier…"
          />
        </div>
        <div className="w-[180px]">
          <Combobox
            options={[
              { value: 'all', label: 'All stages' },
              ...STAGES.map((s) => ({ value: s.key, label: s.label })),
            ]}
            value={stageFilter}
            onValueChange={(v) => setStageFilter((v as 'all' | SponsorProspectStage) ?? 'all')}
            placeholder="Filter stage"
          />
        </div>
        <Button appearance="accent" leadingIcon={<Plus />} onClick={() => setAddOpen(true)}>
          Add prospect
        </Button>
      </div>

      {/* Grid */}
      {visibleRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] py-16 text-center">
          <Building2 className="size-6 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
          <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
            {prospects.length === 0 ? 'No prospects yet' : 'No prospects match your filters'}
          </p>
          <p className="max-w-[420px] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
            {prospects.length === 0
              ? 'Run the outreach agent from the header to seed the pipeline, or add a prospect by hand.'
              : 'Try clearing the search or stage filter.'}
          </p>
        </div>
      ) : (
        <DataGrid>
          <DataGridHeader>
            <DataGridRow>
              <DataGridHead
                filterable={false}
                sortDirection={sortDir('company')}
                onSort={() => toggleSort('company')}
              >
                Company
              </DataGridHead>
              <DataGridHead
                filterable={false}
                sortDirection={sortDir('stage')}
                onSort={() => toggleSort('stage')}
              >
                Stage
              </DataGridHead>
              <DataGridHead filterable={false} sortable={false}>
                Tier
              </DataGridHead>
              <DataGridHead
                align="right"
                filterable={false}
                sortDirection={sortDir('ask')}
                onSort={() => toggleSort('ask')}
              >
                Ask
              </DataGridHead>
              <DataGridHead
                align="right"
                filterable={false}
                sortDirection={sortDir('committed')}
                onSort={() => toggleSort('committed')}
              >
                Committed
              </DataGridHead>
              <DataGridHead filterable={false} sortable={false}>
                Owner
              </DataGridHead>
              <DataGridHead
                align="right"
                filterable={false}
                sortDirection={sortDir('fit')}
                onSort={() => toggleSort('fit')}
              >
                Fit
              </DataGridHead>
              <DataGridHead filterable={false} sortable={false}>
                Next action
              </DataGridHead>
              <DataGridHead filterable={false} sortable={false} align="right">
                <span className="sr-only">Actions</span>
              </DataGridHead>
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody>
            {visibleRows.map((p) => {
              const meta = stageMeta(p.stage);
              const isBusy = busyId === p.id;
              return (
                <DataGridRow key={p.id}>
                  <DataGridCell>
                    <div className="flex flex-col">
                      <span className="text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                        {p.company?.name ?? 'Company'}
                      </span>
                      <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                        {p.primaryContact?.name
                          ? `${p.primaryContact.name}${p.primaryContact.title ? ` · ${p.primaryContact.title}` : ''}`
                          : (p.company?.industry ?? '—')}
                      </span>
                    </div>
                  </DataGridCell>

                  <DataGridCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button
                          variant="ghost"
                          appearance="secondary"
                          size="sm"
                          trailingIcon={<ChevronDown />}
                          loading={isBusy}
                          disabled={busyId !== null && !isBusy}
                          className="px-[var(--c3-style-spacing-4)]"
                        >
                          <Badge appearance={meta.appearance} variant="soft">
                            {meta.label}
                          </Badge>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
                      {STAGES.map((s) => (
                        <DropdownMenuItem
                          key={s.key}
                          label={s.label}
                          onSelect={() => handleAdvance(p, s.key)}
                        />
                      ))}
                    </DropdownMenu>
                  </DataGridCell>

                  <DataGridCell>
                    {p.targetTier ? (
                      <Badge appearance="accent" variant="outline">
                        {p.targetTier}
                      </Badge>
                    ) : (
                      <span className="text-[var(--c3-style-basic-fg-secondary)]">—</span>
                    )}
                  </DataGridCell>

                  <DataGridCell align="right">
                    <span className="tabular-nums">{money(p.askAmount)}</span>
                  </DataGridCell>

                  <DataGridCell align="right">
                    <span className="tabular-nums text-[var(--c3-style-basic-fg-success)]">
                      {p.committedAmount ? money(p.committedAmount) : '—'}
                    </span>
                  </DataGridCell>

                  <DataGridCell>
                    <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                      {p.owner ?? '—'}
                    </span>
                  </DataGridCell>

                  <DataGridCell align="right">
                    <Badge appearance={fitAppearance(p.fitScore)} variant="solid">
                      {Math.round(p.fitScore ?? 0)}
                    </Badge>
                  </DataGridCell>

                  <DataGridCell>
                    <div className="flex flex-col">
                      <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                        {p.nextAction ?? '—'}
                      </span>
                      {p.nextActionDate ? (
                        <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                          Due {formatDate(p.nextActionDate)}
                        </span>
                      ) : null}
                    </div>
                  </DataGridCell>

                  <DataGridCell align="right">
                    <DataGridRowActions>
                      <DropdownMenu align="end">
                        <DropdownMenuTrigger>
                          <Button
                            variant="ghost"
                            appearance="secondary"
                            size="icon-sm"
                            aria-label="Row actions"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuItem
                          label={`Record commitment (${money(p.askAmount)})`}
                          disabled={p.stage === 'committed'}
                          onSelect={() => handleCommit(p)}
                        />
                        <DropdownMenuSeparator />
                        {STAGES.filter((s) => s.key !== p.stage).map((s) => (
                          <DropdownMenuItem
                            key={s.key}
                            label={`Move to ${s.label}`}
                            onSelect={() => handleAdvance(p, s.key)}
                          />
                        ))}
                      </DropdownMenu>
                    </DataGridRowActions>
                  </DataGridCell>
                </DataGridRow>
              );
            })}
          </DataGridBody>
        </DataGrid>
      )}

      {/* Add-prospect modal */}
      <Modal open={addOpen} onOpenChange={setAddOpen}>
        <ModalContent width={520}>
          <ModalHeader>
            <ModalTitle>Add a prospect</ModalTitle>
            <ModalSubtitle>
              Add a company to the pipeline by hand. It starts in the Prospect stage.
            </ModalSubtitle>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-[var(--c3-style-spacing-12)]">
            <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
              <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">
                Company
              </span>
              <Combobox
                options={availableCompanyOptions}
                value={addCompanyId}
                onValueChange={setAddCompanyId}
                placeholder="Select a company"
                emptyMessage="All companies are already in the pipeline"
              />
            </div>

            <div className="grid grid-cols-2 gap-[var(--c3-style-spacing-12)]">
              <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">
                  Target tier
                </span>
                <Combobox
                  options={TIERS.map((t) => ({ value: t, label: t }))}
                  value={addTier}
                  onValueChange={setAddTier}
                  placeholder="Tier"
                />
              </div>
              <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
                <label
                  htmlFor="add-ask"
                  className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
                >
                  Ask amount ($)
                </label>
                <Input
                  id="add-ask"
                  type="number"
                  min={0}
                  value={addAsk}
                  onChange={(e) => setAddAsk(e.target.value)}
                  placeholder="2500"
                />
              </div>
            </div>

            <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
              <label
                htmlFor="add-owner"
                className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
              >
                Owner
              </label>
              <Input
                id="add-owner"
                value={addOwner}
                onChange={(e) => setAddOwner(e.target.value)}
                placeholder="you@wisc.edu"
              />
            </div>

            <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
              <label
                htmlFor="add-next"
                className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
              >
                Next action
              </label>
              <Input
                id="add-next"
                value={addNextAction}
                onChange={(e) => setAddNextAction(e.target.value)}
                placeholder="Find a contact in campus recruiting"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalFooterActions>
              <ModalClose asChild>
                <Button variant="outline" appearance="secondary">
                  Cancel
                </Button>
              </ModalClose>
              <Button
                appearance="accent"
                loading={saving}
                disabled={!addCompanyId}
                onClick={handleAddProspect}
              >
                Add to pipeline
              </Button>
            </ModalFooterActions>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default PipelineTab;

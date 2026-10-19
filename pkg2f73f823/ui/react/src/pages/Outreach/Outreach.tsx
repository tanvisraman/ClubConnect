/*
 * Sponsorship Outreach — the club's fundraising command center.
 *
 * Two tabs over one campaign:
 *   • Pipeline — the sponsorship pipeline tracker (SponsorProspect grid, goal
 *     thermometer, per-stage counts, inline stage moves, manual add).
 *   • Drafts   — the human-in-the-loop review of the outreach agent's ranked,
 *     warm-intro email drafts (approve → mark sent).
 *
 * The "Re-run agent" action ranks warm-intro-connected companies, drafts an
 * email for each, and drops every ranked company into the pipeline.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, RefreshCw, Handshake, KanbanSquare, Mail } from 'lucide-react';

import { c3Action, c3MemberAction } from '@/c3Action';
import type { Company, OutreachCampaign, SponsorshipPacket } from '@/Interfaces';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Alert,
  AlertAppearanceIcon,
  AlertContent,
  AlertTitle,
  AlertDescription,
} from '@/components/ui/alert';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import PipelineTab from './PipelineTab';
import DraftsTab from './DraftsTab';

const CAMPAIGN_ID = 'camp_dssd_2026_fall';
const PACKET_ID = 'pkt_dssd_2026';
const MAX_COMPANIES = 8;

interface Tier {
  name: string;
  amount?: number;
}

interface RawTier {
  name?: string;
  tier?: string;
  amount?: number;
  price?: number;
}

/** Parse the packet's tiersJson defensively (it is a stringified JSON array). */
function parseTiers(tiersJson?: string): Tier[] {
  if (!tiersJson) return [];
  try {
    const parsed = JSON.parse(tiersJson);
    const raw: RawTier[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.tiers)
        ? parsed.tiers
        : [];
    return raw.map((t) => ({
      name: t.name ?? t.tier ?? 'Tier',
      amount: typeof t.amount === 'number' ? t.amount : t.price,
    }));
  } catch {
    return [];
  }
}

const Outreach: React.FC = () => {
  const [packet, setPacket] = useState<SponsorshipPacket | null>(null);
  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [tab, setTab] = useState('pipeline');

  const loadShell = useCallback(async () => {
    setError(null);
    try {
      const [packetResp, campaignResp, companiesResp] = await Promise.all([
        c3Action('SponsorshipPacket', 'fetch', {
          filter: `id == '${PACKET_ID}'`,
          include: 'this, club.name, club.mission, club.website',
          limit: 1,
        }),
        c3Action('OutreachCampaign', 'fetch', {
          filter: `id == '${CAMPAIGN_ID}'`,
          include: 'this, packet.title, club.name',
          limit: 1,
        }),
        c3Action('Company', 'fetch', {
          include: 'this, name, industry',
          order: 'ascending(name)',
          limit: -1,
        }),
      ]);
      setPacket((packetResp?.objs?.[0] as SponsorshipPacket) ?? null);
      setCampaign((campaignResp?.objs?.[0] as OutreachCampaign) ?? null);
      setCompanies((companiesResp?.objs ?? []) as Company[]);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Failed to load the outreach workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShell();
  }, [loadShell]);

  const handleRefresh = useCallback(() => {
    setError(null);
    loadShell();
    setReloadToken((t) => t + 1);
  }, [loadShell]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      await c3MemberAction('OutreachCampaign', 'generateDrafts', { id: CAMPAIGN_ID }, [
        MAX_COMPANIES,
      ]);
      const campaignResp = await c3Action('OutreachCampaign', 'fetch', {
        filter: `id == '${CAMPAIGN_ID}'`,
        include: 'this, packet.title, club.name',
        limit: 1,
      });
      setCampaign((campaignResp?.objs?.[0] as OutreachCampaign) ?? null);
      setReloadToken((t) => t + 1);
    } catch (e) {
      setError(
        typeof e === 'string'
          ? e
          : 'The outreach agent failed to generate drafts. Please try again.',
      );
    } finally {
      setGenerating(false);
    }
  }, []);

  const tiers = useMemo(() => parseTiers(packet?.tiersJson), [packet]);
  const clubName = packet?.club?.name ?? campaign?.club?.name ?? 'Club';

  return (
    <div className="flex min-h-full w-full flex-col">
      <PageHeader
        title="Sponsorship Outreach"
        description={
          packet ? `${clubName} · ${packet.title}` : 'AI-ranked, warm-intro sponsorship outreach'
        }
        badges={
          <Badge appearance="accent" variant="soft" leadingIcon={<Handshake />}>
            Warm-intro agent
          </Badge>
        }
        actions={
          <div className="flex items-center gap-[var(--c3-style-spacing-8)]">
            <Button
              variant="outline"
              appearance="secondary"
              leadingIcon={<RefreshCw />}
              onClick={handleRefresh}
              disabled={loading || generating}
            >
              Refresh
            </Button>
            <Button
              appearance="accent"
              leadingIcon={<Sparkles />}
              loading={generating}
              onClick={handleGenerate}
              disabled={loading}
            >
              Re-run agent
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

        {generating ? (
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>Agent is working…</AlertTitle>
              <AlertDescription>
                Ranking warm-intro-connected companies and drafting outreach emails. This runs a
                live LLM call and can take a moment.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {/* Packet summary */}
        {packet ? (
          <Card>
            <CardHeader>
              <CardTitle>{packet.title}</CardTitle>
              <CardDescription>
                {clubName}
                {packet.club?.mission ? ` — ${packet.club.mission}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-[var(--c3-style-spacing-12)]">
              {packet.description ? (
                <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                  {packet.description}
                </p>
              ) : null}
              {tiers.length > 0 ? (
                <div className="flex flex-wrap gap-[var(--c3-style-spacing-8)]">
                  {tiers.map((t, i) => (
                    <Badge key={t.name ?? i} variant="outline" appearance="accent">
                      {t.name ?? 'Tier'}
                      {typeof t.amount === 'number' ? ` · $${t.amount.toLocaleString()}` : ''}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} variant="bordered" size="lg">
          <TabsList>
            <TabsTrigger value="pipeline" className="gap-[var(--c3-style-spacing-6)]">
              <KanbanSquare aria-hidden />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-[var(--c3-style-spacing-6)]">
              <Mail aria-hidden />
              Drafts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="pt-[var(--c3-style-spacing-16)]">
            <PipelineTab
              campaignId={CAMPAIGN_ID}
              goalAmount={packet?.goalAmount}
              companies={companies}
              reloadToken={reloadToken}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="drafts" className="pt-[var(--c3-style-spacing-16)]">
            <DraftsTab
              campaignId={CAMPAIGN_ID}
              clubName={clubName}
              reloadToken={reloadToken}
              generating={generating}
              onGenerate={handleGenerate}
              onError={setError}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Outreach;

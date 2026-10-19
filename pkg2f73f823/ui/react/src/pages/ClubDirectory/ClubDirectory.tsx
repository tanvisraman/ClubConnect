/*
 * Clubs Directory — the company rep's view of the platform.
 *
 * A company representative cannot see club-side workflows; what they need is a
 * browsable, searchable list of every UW-Madison club they could reach out to,
 * with the contact info and mission needed to decide who to approach. From here
 * they jump to the Requests board to post an opportunity.
 *
 * The club set is large (1000+), so this fetches one page at a time with a
 * case-insensitive server-side name search — never the whole table at once.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Globe,
  Mail,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from 'lucide-react';

import { c3Action } from '@/c3Action';
import type { Club } from '@/Interfaces';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { PageHeader } from '@/components/ui/page-header';
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
import { InputSearch } from '@/components/ui/input-search';
import { Spinner } from '@/components/ui/spinner';
import {
  Alert,
  AlertAppearanceIcon,
  AlertContent,
  AlertTitle,
  AlertDescription,
} from '@/components/ui/alert';

const PAGE_SIZE = 24;

/** Escape single quotes so a search term can't break the filter string. */
function escapeTerm(term: string): string {
  return term.replace(/'/g, "\\'");
}

const ClubDirectory: React.FC = () => {
  const navigate = useNavigate();
  const { reportError } = useErrorBoundary();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box so we don't fire a fetch on every keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(id);
  }, [search]);

  const loadClubs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filter = debouncedSearch
        ? `containsIgnoreCase(name, '${escapeTerm(debouncedSearch)}')`
        : undefined;
      const spec: Record<string, unknown> = {
        include: 'this, name, category, orgType, mission, membershipBenefits, contactName, contactEmail, website',
        order: 'ascending(name)',
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (filter) spec.filter = filter;
      const resp = await c3Action('Club', 'fetch', spec);
      setClubs((resp?.objs ?? []) as Club[]);
      setTotal(typeof resp?.count === 'number' ? resp.count : (resp?.objs ?? []).length);
    } catch (e) {
      setError('Failed to load the clubs directory.');
      reportError(e);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, reportError]);

  useEffect(() => {
    loadClubs();
  }, [loadClubs]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex min-h-full w-full flex-col">
      <PageHeader
        title="Clubs Directory"
        description="Every UW-Madison club you can reach out to — browse, search, and find who to contact."
        badges={
          <Badge appearance="accent" variant="soft" leadingIcon={<Users />}>
            {total.toLocaleString()} clubs
          </Badge>
        }
        actions={
          <Button
            appearance="accent"
            leadingIcon={<Inbox />}
            onClick={() => navigate('/requests')}
          >
            Post a request
          </Button>
        }
      />

      <div className="flex flex-col gap-[var(--c3-style-spacing-16)] p-[var(--c3-style-spacing-24)]">
        <div className="max-w-[420px]">
          <InputSearch
            aria-label="Search clubs by name"
            placeholder="Search clubs by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />
        </div>

        {error ? (
          <Alert variant="soft" appearance="destructive">
            <AlertAppearanceIcon appearance="destructive" />
            <AlertContent>
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-[var(--c3-style-spacing-8)] py-16 text-[var(--c3-style-basic-fg-secondary)]">
            <Spinner size="lg" />
            <span className="text-c3-regular-body-p2">Loading clubs…</span>
          </div>
        ) : null}

        {!loading && clubs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] py-16 text-center">
            <Users className="size-6 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
            <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">No clubs found</p>
            <p className="max-w-[420px] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              {debouncedSearch
                ? `No clubs match “${debouncedSearch}”. Try a different search.`
                : 'There are no clubs to show right now.'}
            </p>
          </div>
        ) : null}

        {!loading && clubs.length > 0 ? (
          <div className="grid grid-cols-1 gap-[var(--c3-style-spacing-16)] md:grid-cols-2 xl:grid-cols-3">
            {clubs.map((club) => (
              <Card key={club.id} variant="elevated" className="flex flex-col">
                <CardHeader>
                  <CardTitle>{club.name}</CardTitle>
                  {club.category || club.orgType ? (
                    <CardDescription className="flex flex-wrap items-center gap-[var(--c3-style-spacing-6)]">
                      {club.category ? (
                        <Badge variant="soft" appearance="secondary">
                          {club.category}
                        </Badge>
                      ) : null}
                      {club.orgType ? (
                        <Badge variant="outline" appearance="secondary">
                          {club.orgType}
                        </Badge>
                      ) : null}
                    </CardDescription>
                  ) : null}
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-[var(--c3-style-spacing-8)]">
                  {club.mission ? (
                    <p className="line-clamp-4 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                      {club.mission}
                    </p>
                  ) : (
                    <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-neutral)]">
                      No mission on file.
                    </p>
                  )}
                </CardContent>

                <CardFooter bordered className="flex flex-col items-start gap-[var(--c3-style-spacing-6)]">
                  {club.contactEmail ? (
                    <a
                      href={`mailto:${club.contactEmail}`}
                      className="inline-flex items-center gap-[var(--c3-style-spacing-6)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-accent)] hover:underline"
                    >
                      <Mail className="size-4" aria-hidden />
                      {club.contactName ? `${club.contactName} · ` : ''}
                      {club.contactEmail}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-[var(--c3-style-spacing-6)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-neutral)]">
                      <Mail className="size-4" aria-hidden />
                      No contact listed
                    </span>
                  )}
                  {club.website ? (
                    <a
                      href={club.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-[var(--c3-style-spacing-6)] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-accent)] hover:underline"
                    >
                      <Globe className="size-4" aria-hidden />
                      Visit website
                    </a>
                  ) : null}
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : null}

        {/* Pagination */}
        {!loading && total > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-[var(--c3-style-spacing-12)] pt-[var(--c3-style-spacing-8)]">
            <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{' '}
              {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-[var(--c3-style-spacing-8)]">
              <Button
                variant="outline"
                appearance="secondary"
                leadingIcon={<ChevronLeft />}
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                appearance="secondary"
                trailingIcon={<ChevronRight />}
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ClubDirectory;

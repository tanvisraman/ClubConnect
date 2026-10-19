# Workspace Summary

> This is the **work-to-date** summary of this workspace. It starts from the template's initial
> state below and **you (the agent) keep it updated** as you make meaningful changes (new/renamed
> types, new UI pages/routes, seed/data, key decisions). Read it first at the start of a chat to
> recall what has been done; update it as you go. Keep it concise — a map, not a transcript.

## Current state

**Multi-tenant university-club platform** — ONE data graph (clubs, companies, alumni, money,
events) with FOUR human-in-the-loop agent workflows on top. "The graph is the moat; the agents are
the UX." Built full-scope (Mode A). Backend (18 entity types, 4 agents), seed data, and a wired,
role-aware React frontend are all built and verified end-to-end.

Three product pillars:
- **Fund** — sponsorship-outreach agent (`OutreachCampaign.generateDrafts`) + grant-discovery agent (`Club.discoverGrants`).
- **Operate** — vendor-sourcing agent (`ClubEvent.sourceVendors`).
- **Connect** — connection/matching agent (`Club.findConnections`) + the CompanyRequest↔ClubSubmission board.

## Packages

- `pkg2f73f823` (main) — the platform app.

## Backend types (`src/`)

**Core graph**
- **`Club`** — UW-Madison org: name, orgType, category, website, mission, membershipBenefits,
  contact*, **`skills: [string]`** + social snapshot fields (`instagramHandle/Url/Followers/LatestPost`,
  `linkedinUrl/Followers/LatestPost`) surfaced on the CompanyRep club-profile modal,
  `packets: [SponsorshipPacket](club)`. JS impl `Club.js`: **`findConnections(topic, max)`**
  (consent-gated Affiliation ranking, workflow="connection") + **`discoverGrants(max)`**
  (non-closed Grants ranked w/ eligibility + draftStarter, workflow="grant").
- **`Company`** — prospective sponsor: name, industry, careerCluster, headquarters, website,
  description, `alumni: [AlumniContact](currentCompany)`.
- **`AlumniContact`** — alum providing the warm intro: name, cohort, majors[], careerCluster,
  positionTitle, organizationName, linkedInUrl, `currentCompany: Company`, isDecisionMaker,
  seniority, **`consentStatus`** (opted_in/pending/opted_out).
- **`Affiliation`** — *crown-jewel edge* (Person↔Company): contact, company, role, seniority,
  warmth (double), isDecisionMaker, consentStatus, source, tenureStartYear.

**Fund**
- **`SponsorshipPacket`** — club offering: club, title, description, targetIndustries[],
  targetClusters[], tiersJson, fileUrl, **`goalAmount: double`** (drives the pipeline goal thermometer),
  `campaigns: [OutreachCampaign](packet)`.
- **`OutreachCampaign`** — agent run: packet, club, name, status, createdTimestamp,
  `messages: [OutreachMessage](campaign)`, **`generateDrafts(maxCompanies): [OutreachMessage]` (js)**.
  `generateDrafts` now ALSO upserts a `SponsorProspect` (stage "contacted") for every ranked company
  and links each `OutreachMessage.prospect` to it (so the Drafts tab and Pipeline tab share rows).
- **`OutreachMessage`** — ranked sponsor + drafted email: campaign, company, warmIntroContact,
  **`prospect: SponsorProspect`** (links a draft to its pipeline row),
  matchScore, matchRationale, draftSubject, draftBody, status, member fns **`approve()`/`markSent()`** (js).
- **`SponsorProspect`** — one row of the **sponsorship pipeline tracker**: company, campaign,
  primaryContact:CompanyContact, `stage` (prospect/contacted/replied/meeting/committed/declined),
  targetTier, askAmount, committedAmount, owner, fitScore, fitRationale, nextAction, nextActionDate,
  lastTouchTimestamp, notes, `messages: [OutreachMessage](prospect)`. JS member fns
  **`advanceStage(stage, by)`** (sets stage + lastTouch, AuditLog, returns full refreshed row) and
  **`recordCommitment(amount, by)`** (stage→committed + committedAmount, AuditLog). Both re-fetch and
  return the full object (merge() alone returns a sparse row — the UI updates rows from the return value).
- **`Grant`** — funding opp: name, source, amount, deadline, eligibility, targetCategories[],
  status (open/upcoming/closed), url, description.

**Operate**
- **`ServiceProvider`** — caterer/vendor: name, cuisines[], serviceArea, priceLevel, minimumHeadcount,
  website, description, rating, `menus: [Menu](serviceProvider)`.
- **`Menu`** — serviceProvider, name, description, `items: [MenuItem](menu)`.
- **`MenuItem`** — menu, name, description, category, pricePerPerson, minimumOrder, dietaryTags[].
- **`ClubEvent`** — (⚠ renamed from `Event` — `Event` is a RESERVED platform type) club, name,
  description, eventDate, headcount, budget, cuisine, status, speaker:AlumniContact,
  vendor:ServiceProvider, sponsor:Company, **`sourceVendors(maxResults): [MatchResult]` (js)**
  (per-head price-fit per ServiceProvider → LLM rank, workflow="vendor").

**Connect / inbound**
- **`CompanyRequest`** — company-posted need: company, title, description, requestType,
  targetCategories[], budget, deadline, status (open/reviewing/closed), `submissions: [ClubSubmission](request)`.
- **`ClubSubmission`** — a club's application: request, club, pitch, status
  (submitted/shortlisted/accepted/declined), submittedTimestamp.

**RBAC + agent plumbing**
- **`AppUser`** — persona: name, email, role (PlatformAdmin/ClubOfficer/ClubMember/CompanyRep/
  ServiceProviderRep/AlumniUser), orgType, orgId. Drives the frontend ActiveUser/RBAC scope.
- **`MatchResult`** — shared explainable agent output: workflow, sourceType, sourceId, targetType,
  targetId, targetName, score, rationale, provenance, extraJson (workflow-specific payload),
  createdTimestamp.
- **`AuditLog`** — action, actor, targetType, targetId, approvedBy, timestamp, details. Written by each agent.
- **`ClubOfficer`**, **`CompanyContact`** — people-role rows on clubs/companies.

All agents call `GenaiCore.Llm.Completion.Client.forConfigKey("default-completions")`, persist
`MatchResult`s with deterministic ids, and write an `AuditLog` row.

## UI pages / routes

App shell (`App.tsx`) wraps everything in **`ActiveUserProvider`**. The persona bar (`RoleSwitcher`) is
rendered in the shell on **every page** — not Dashboard-only — so personas that can't open the Dashboard
(e.g. a Vendor Rep, whose only tab is the Menu Board) can still switch back to the other profiles. A
router-level **`RoleRedirect`** guard bounces a persona off any tab its role can't see to the first allowed tab.
Routes + nav items (`config/navigation.ts`), each tagged with `roles` (see RBAC below):
- **`/`** → `Dashboard` — role-aware: KPI strip (counts of the graph) + workflow entry-point cards filtered by persona. **CompanyRep gets a dedicated scoped view** (`Dashboard/CompanyRepDashboard.tsx`): company name as the page title (e.g. AWS for Dana) + only THIS company's open requests, each with a proposal count and clickable applying-club buttons that open a profile modal (skills badges, latest ClubEvent, Instagram/LinkedIn social snapshot). No platform-graph KPIs (companies/alumni/grants/vendors) are queried for CompanyRep. (The old "One graph of clubs… three agent-driven workflows on top" PageHeader description has been removed from all dashboards.)
- **`/outreach`** → `Outreach` (Handshake) — the fundraising command center, **two tabs over one campaign**
  (shell `pages/Outreach/Outreach.tsx`; PageHeader "Re-run agent" ranks warm-intro companies, drafts an
  email for each, and drops every ranked company into the pipeline): **Pipeline** (`PipelineTab.tsx`) — the
  SponsorProspect tracker grid (`DataGrid`) with a committed-vs-`goalAmount` goal thermometer (`Progress`) +
  per-stage count chips, search + stage `Combobox` filter, inline stage moves (`DropdownMenu` → `advanceStage`),
  row-action "Record commitment" (`recordCommitment`), and an Add-prospect `Modal` (`SponsorProspect.upsert`);
  **Drafts** (`DraftsTab.tsx`) — the human-in-the-loop review of the agent's ranked warm-intro email cards
  (edit subject/body → `approve` → `markSent`). *(club roles)*
- **`/grants`** → `Grants` (Award) — grant-discovery agent; ranked cards w/ eligibility badge + collapsible draft starter. *(club roles)*
- **`/vendors`** → `Vendors` (UtensilsCrossed) — pick a ClubEvent, run vendor-sourcing; price-fit comparison grid. *(club roles)*
- **`/connections`** → `Connections` (Network) — connection agent; consent-gated alumni ranking. *(club roles)*
- **`/clubs`** → `ClubDirectory` (Users) — **NEW** company-rep club browser: server-side paginated (PAGE_SIZE 24, limit/offset), debounced case-insensitive name search via `containsIgnoreCase(name,'…')`; card grid + "Post a request" → `/requests`. *(PlatformAdmin, CompanyRep)*
- **`/requests`** → `Requests` (Inbox) — role-aware CompanyRequest board; ClubOfficer applies via Modal (`ClubSubmission.upsert`), CompanyRep sees **own** postings only + can **post a request** (upsert CompanyRequest, scoped to activeCompanyId, status 'open'). *(club roles + CompanyRep)*
- **`/menu-board`** → `VendorBoard` (ChefHat) — **NEW** vendor-rep-only board scoped to `activeServiceProviderId`: edit business profile (`ServiceProvider.upsert`) + manage menus/items (`Menu.upsert`, `MenuItem.upsert`, `MenuItem.remove`). *(PlatformAdmin, ServiceProviderRep)*

### RBAC (who sees which tabs)
- Access rules live as data in `config/navigation.ts`: `NavigationItem.roles?: string[]` (omitted/empty ⇒ visible to all). Helpers `isNavItemVisible(item, role)` + `visibleNavItems(role)` drive both `SideNav` and `RoleRedirect`. `CLUB_ROLES = [PlatformAdmin, ClubOfficer, ClubMember]`.
- **ClubOfficer / ClubMember:** all original club tabs (dashboard, outreach, grants, vendors, connections, requests).
- **CompanyRep:** Dashboard + Clubs Directory + Company Requests only (own requests; cannot see other companies' requests).
- **ServiceProviderRep:** Menu Board only (redirected there; no other tabs).
- **AlumniUser:** removed from the persona switcher (`RoleSwitcher` filters it out).

Shared frontend infra:
- `context/ActiveUser.tsx` — `ActiveUserProvider`/`useActiveUser()`; fetches `AppUser`, holds
  activeUser + `activeClubId`/`activeCompanyId`/`activeServiceProviderId` (from orgType/orgId), persists
  to localStorage (`clubhub.activeUserId`, default `user_dssd_officer`).
- `components/RoleSwitcher/RoleSwitcher.tsx` — persona dropdown (AlumniUser excluded) + active-role Badge.
- `components/SideNav/SideNav.tsx` — renders `visibleNavItems(activeUser?.role ?? '')` (role-filtered).
- Entity TS interfaces in `ui/react/src/Interfaces.tsx`.

## Seed / data (`data/`)

- `Club/clubs.json` (1187) — DSSD (`club_data_science_for_sustainable_development_uw_madison`) and
  Badger Consulting (`club_badger_consulting`) populated with `skills` + Instagram/LinkedIn snapshot fields
  for the CompanyRep club-profile modal. `Company/companies.json` (17) — `co_amazon` is named
  "Amazon Web Services (AWS)" (Dana's company). `AlumniContact/alumni.json` (17, each w/
  consentStatus — 15 opted_in, al_fernando_tejada pending, al_luis_contreras opted_out).
- `Affiliation/affiliations.json` (warmth 0.5–0.9), `Grant/grants.json` (6 open + 1 closed),
  `ServiceProvider/providers.json` (6: Ian's Pizza, Food Fight, Mediterranean Cafe, Taqueria
  Guadalajara, Swagat Indian, Short Stack) + `Menu/` + `MenuItem/`.
- `ClubEvent/events.json` (evt_dssd_datathon_2026 headcount 80/budget 800/Pizza; evt_badger_networking_2026 40/600/Mediterranean).
- `ClubOfficer/`, `CompanyContact/`, `CompanyRequest/requests.json` (3), `ClubSubmission/submissions.json` (2),
  `AppUser/users.json` (6 personas), `SponsorshipPacket/pkt_dssd_2026.json` (**goalAmount 25000**), `OutreachCampaign/`.
- `SponsorProspect/prospects.json` (**8 seed rows** across stages for campaign `camp_dssd_2026_fall`) — seeds the
  Pipeline tab so it shows a populated tracker before the agent runs.
- All via `upsertSeedData`. `OutreachMessage`s + `MatchResult`s are created at runtime by the agents
  (and `generateDrafts` also upserts a `SponsorProspect` per ranked company).

## Key decisions

- **One graph, agents on top.** Company universe derived from alumni employers (built-in warm intro).
  `MatchResult` is the single explainable output type for all four agents (`workflow` discriminator +
  `extraJson` payload), so the UI pattern is uniform.
- **RBAC as data (demo).** `AppUser` personas + `ActiveUserProvider` model row-level org scope on the
  client; every page reads activeClubId/activeCompanyId/activeServiceProviderId to decide what it
  fetches/offers. Tab visibility is also data: `NavigationItem.roles` + `visibleNavItems(role)` filter
  the SideNav and a `RoleRedirect` guard enforces it at the router. The persona switcher is shown on every
  page so you can always switch back, even from a single-tab persona like a Vendor Rep.
  A production deployment would enforce all of this with platform ActionRules, not client scope.
- **C3 fetch filter idioms:** `matches`/`like`/`lower()` are NOT supported; `contains()` is
  case-SENSITIVE; use **`containsIgnoreCase(field,'term')`** for case-insensitive search (escape single
  quotes in the term).
- **Compliance:** consent flags on all people data; `findConnections` fetches only
  `consentStatus == 'opted_in'` (pending/opted-out never surfaced); no LinkedIn scraping; CAN-SPAM/
  FERPA; human approval gate before any outbound; provenance on every match; AuditLog on every agent run.
- **`Event` is reserved** → custom type is **`ClubEvent`** (src/ClubEvent.c3typ + .js).
- **Sponsorship pipeline = a dedicated `SponsorProspect` entity as the spine** (not stage state stuffed onto
  OutreachMessage). The agent's `generateDrafts` auto-populates it (one prospect per ranked company, stage
  "contacted") and links `OutreachMessage.prospect`, so the same company is one tracker row in the Pipeline
  tab and one editable email card in the Drafts tab. `advanceStage`/`recordCommitment` **re-fetch and return
  the full object** because `make().merge()` alone returns a sparse row (only set fields) — the UI patches its
  row from the return value, so a sparse return would blank out the other columns.
- **LLM:** `default-completions`, `{ returnJson: true, max_tokens: 4096 }`, parse defensively.
- **C3 JS idioms:** `Type.make({...}).merge()`, `mergeBatch`, `fetch({filter, include:"this, ref.field"}).objs`.
- **Build:** `VITE_C3_PKG=pkg2f73f823 npm run build`. Frontend fetches everything via `c3Action`
  (FetchSpec passed directly, flat dot-notation includes); no hardcoded data.

See `TEMPLATE_SUMMARY.md` for the template initial state.

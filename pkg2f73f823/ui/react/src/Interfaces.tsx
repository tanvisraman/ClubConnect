/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ReactElement } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  lastName: string;
  firstName: string;
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
}

export interface SnackbarMessage {
  message: ReactElement;
  key: number;
  severity?: 'success' | 'info' | 'warning' | 'error';
  error?: boolean;
}

/** Sample / API document row (examples + fetchDocuments). */
export interface Document {
  documentName: string;
  program: string;
  owner: string;
  checklistApplied: string;
  attachments: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ProgramDocument {
  documentName: string;
  owner: string;
  status: string;
  uploadedAt: string;
}

/** Program row with optional nested documents (examples + fetchPrograms). */
export interface Program {
  id: string;
  program: string;
  totalDocuments: number;
  passed: number;
  failed: number;
  pending: number;
  documents?: ProgramDocument[];
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  estimatedTime: string;
}

/** Auto-populated platform metadata present on every C3 entity. */
export interface Meta {
  tenant?: string;
  tenantTagId?: number;
  created?: string;
  createdBy?: string;
  updated?: string;
  updatedBy?: string;
  fetchInclude?: string;
  fetchType?: string;
}

/** A UW-Madison student organization (sourced from the WIN club directory). */
export interface Club {
  id: string;
  name: string;
  orgType?: string;
  category?: string;
  website?: string;
  mission?: string;
  membershipBenefits?: string;
  contactName?: string;
  contactEmail?: string;
  /** Core skills / competencies the club can bring to a partner. */
  skills?: string[];
  instagramHandle?: string;
  instagramUrl?: string;
  instagramFollowers?: number;
  instagramLatestPost?: string;
  linkedinUrl?: string;
  linkedinFollowers?: number;
  linkedinLatestPost?: string;
  meta?: Meta;
}

/** A prospective sponsor company (derived from alumni employers). */
export interface Company {
  id: string;
  name: string;
  industry?: string;
  careerCluster?: string;
  headquarters?: string;
  website?: string;
  description?: string;
  alumni?: AlumniContact[];
  meta?: Meta;
}

/** A UW-Madison alumnus who can provide a warm introduction into a {@link Company}. */
export interface AlumniContact {
  id: string;
  name: string;
  peopleCohort?: number;
  education?: string;
  majors?: string[];
  certificates?: string[];
  currentIndustries?: string[];
  careerCluster?: string;
  positionTitle?: string;
  organizationName?: string;
  linkedInUrl?: string;
  currentCompany?: Company;
  isDecisionMaker?: boolean;
  seniority?: string;
  meta?: Meta;
}

/** A club's sponsorship offering (tiers, target industries/clusters). */
export interface SponsorshipPacket {
  id: string;
  club?: Club;
  title: string;
  description?: string;
  targetIndustries?: string[];
  targetClusters?: string[];
  tiersJson?: string;
  fileUrl?: string;
  /** Fundraising target in dollars — drives the pipeline goal thermometer. */
  goalAmount?: number;
  meta?: Meta;
}

export type CampaignStatus = 'draft' | 'generating' | 'ready';

/** A run of the sponsorship-outreach agent against a {@link SponsorshipPacket}. */
export interface OutreachCampaign {
  id: string;
  packet?: SponsorshipPacket;
  club?: Club;
  name?: string;
  status?: CampaignStatus;
  createdTimestamp?: string;
  messages?: OutreachMessage[];
  meta?: Meta;
}

export type OutreachMessageStatus = 'draft' | 'approved' | 'sent' | 'skipped';

/** A single ranked prospective sponsor + the LLM-drafted outreach email. */
export interface OutreachMessage {
  id: string;
  campaign?: OutreachCampaign;
  company?: Company;
  warmIntroContact?: AlumniContact;
  /** The sponsorship-pipeline prospect this email belongs to. */
  prospect?: SponsorProspect;
  matchScore?: number;
  matchRationale?: string;
  draftSubject?: string;
  draftBody?: string;
  status?: OutreachMessageStatus;
  meta?: Meta;
}

/** A company contact (recruiter / partnerships lead) at a prospective sponsor. */
export interface CompanyContact {
  id: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  company?: Company;
  meta?: Meta;
}

/**
 * The stages a sponsor moves through in the fundraising pipeline, in order.
 * {@code declined} is terminal and off the forward path.
 */
export type SponsorProspectStage =
  | 'prospect'
  | 'contacted'
  | 'replied'
  | 'meeting'
  | 'committed'
  | 'declined';

/**
 * One row in the sponsorship pipeline tracker: a company being worked toward a
 * commitment, with its stage, tier target, ask/committed dollars, owner, and
 * AI fit score. Populated by the outreach agent and editable by club officers.
 */
export interface SponsorProspect {
  id: string;
  company?: Company;
  campaign?: OutreachCampaign;
  primaryContact?: CompanyContact;
  stage: SponsorProspectStage;
  targetTier?: string;
  askAmount?: number;
  committedAmount?: number;
  owner?: string;
  fitScore?: number;
  fitRationale?: string;
  nextAction?: string;
  nextActionDate?: string;
  lastTouchTimestamp?: string;
  notes?: string;
  messages?: OutreachMessage[];
  meta?: Meta;
}

export type ConsentStatus = 'opted_in' | 'pending' | 'opted_out';

/**
 * The crown-jewel edge of the graph: an attributed Person↔Company relationship
 * carrying warmth, decision-maker status, and consent.
 */
export interface Affiliation {
  id: string;
  contact?: AlumniContact;
  company?: Company;
  role?: string;
  seniority?: string;
  warmth?: number;
  isDecisionMaker?: boolean;
  consentStatus?: ConsentStatus;
  source?: string;
  tenureStartYear?: number;
  meta?: Meta;
}

/** A funding opportunity a club might apply for. */
export interface Grant {
  id: string;
  name: string;
  source?: string;
  amount?: number;
  deadline?: string;
  eligibility?: string;
  targetCategories?: string[];
  status?: 'open' | 'upcoming' | 'closed';
  url?: string;
  description?: string;
  meta?: Meta;
}

/** A priced line item on a vendor {@link Menu}. */
export interface MenuItem {
  id: string;
  menu?: Menu;
  name: string;
  description?: string;
  category?: string;
  pricePerPerson?: number;
  minimumOrder?: number;
  dietaryTags?: string[];
  meta?: Meta;
}

/** A named menu/package offered by a {@link ServiceProvider}. */
export interface Menu {
  id: string;
  serviceProvider?: ServiceProvider;
  name: string;
  description?: string;
  items?: MenuItem[];
  meta?: Meta;
}

/** A caterer / event-services vendor clubs can book to operate an event. */
export interface ServiceProvider {
  id: string;
  name: string;
  cuisines?: string[];
  serviceArea?: string;
  priceLevel?: number;
  minimumHeadcount?: number;
  website?: string;
  description?: string;
  rating?: number;
  menus?: Menu[];
  meta?: Meta;
}

/** A club event (speaker + sponsor + vendor hang off it). */
export interface ClubEvent {
  id: string;
  club?: Club;
  name: string;
  description?: string;
  eventDate?: string;
  headcount?: number;
  budget?: number;
  cuisine?: string;
  status?: 'planning' | 'booked' | 'complete';
  speaker?: AlumniContact;
  vendor?: ServiceProvider;
  sponsor?: Company;
  meta?: Meta;
}

export type ClubSubmissionStatus =
  | 'submitted'
  | 'shortlisted'
  | 'accepted'
  | 'declined';

/** A club's application to a {@link CompanyRequest}. */
export interface ClubSubmission {
  id: string;
  request?: CompanyRequest;
  club?: Club;
  pitch?: string;
  status?: ClubSubmissionStatus;
  submittedTimestamp?: string;
  meta?: Meta;
}

/** A need posted by a company that clubs can respond to. */
export interface CompanyRequest {
  id: string;
  company?: Company;
  title: string;
  description?: string;
  requestType?: string;
  targetCategories?: string[];
  budget?: number;
  deadline?: string;
  status?: 'open' | 'reviewing' | 'closed';
  submissions?: ClubSubmission[];
  meta?: Meta;
}

export type AgentWorkflow = 'sponsorship' | 'grant' | 'vendor' | 'connection';

/** The shared, explainable output of every agent: a scored, provenance-bearing match. */
export interface MatchResult {
  id: string;
  workflow: AgentWorkflow;
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  score?: number;
  rationale?: string;
  provenance?: string;
  extraJson?: string;
  createdTimestamp?: string;
  meta?: Meta;
}

export type AppRole =
  | 'PlatformAdmin'
  | 'ClubOfficer'
  | 'ClubMember'
  | 'CompanyRep'
  | 'ServiceProviderRep'
  | 'AlumniUser';

/** An application user + the role/org scope governing what they can see and do. */
export interface AppUser {
  id: string;
  name: string;
  email?: string;
  role: AppRole;
  orgType?: string;
  orgId?: string;
  meta?: Meta;
}

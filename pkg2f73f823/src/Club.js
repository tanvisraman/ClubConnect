/*
 * Club agent implementations:
 *   - findConnections: the connection agent (alumni/companies ranked by warmth × relevance)
 *   - discoverGrants:  the grant-discovery agent (grants ranked + eligibility + draft starter)
 *
 * Both use the platform LLM (GenaiCore.Llm.Completion.Client) for the relevance
 * judgment and rationale, persist explainable MatchResults (provenance), and
 * write an AuditLog row for the run.
 */

/** Strip code fences and isolate the first JSON object/array from an LLM response. */
function extractJson(text) {
  if (text == null) {
    return null;
  }
  if (typeof text !== "string") {
    return text;
  }
  var s = text.trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
  var start = -1;
  for (var i = 0; i < s.length; i++) {
    if (s[i] === "{" || s[i] === "[") {
      start = i;
      break;
    }
  }
  return start === -1 ? JSON.parse(s) : JSON.parse(s.substring(start));
}

/** Remove any prior MatchResults for this (workflow, sourceId) so a re-run replaces cleanly. */
function clearPriorMatches(workflow, sourceId) {
  try {
    var existing = MatchResult.fetch({
      filter: Filter.eq("workflow", workflow).and(Filter.eq("sourceId", sourceId)),
      include: "this",
      limit: -1
    }).objs || [];
    if (existing.length > 0) {
      MatchResult.removeAll(Filter.eq("workflow", workflow).and(Filter.eq("sourceId", sourceId)));
    }
  } catch (e) {
    // best-effort cleanup; deterministic ids below keep re-runs mostly idempotent
  }
}

function logRun(action, sourceId, details) {
  AuditLog.make({
    id: "audit_" + action + "_" + sourceId + "_" + DateTime.now().toString(),
    action: action,
    actor: "system-agent",
    targetType: "Club",
    targetId: sourceId,
    timestamp: DateTime.now(),
    details: details
  }).merge();
}

function llmComplete(system, userPayload) {
  var client = GenaiCore.Llm.Completion.Client.forConfigKey("default-completions");
  var resp = client.completion(
    [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(userPayload) }
    ],
    { returnJson: true, max_tokens: 4096 }
  );
  var parsed = extractJson(resp.choices[0].message.content);
  return (parsed && parsed.results) ? parsed.results : (Array.isArray(parsed) ? parsed : []);
}

function findConnections(topic, maxResults) {
  var n = (maxResults && maxResults > 0) ? maxResults : 6;
  var theTopic = topic || "general club partnership and speaker opportunities";

  var club = Club.fetch({ filter: Filter.eq("id", this.id), include: "this", limit: 1 }).objs[0];
  if (!club) {
    throw "Club " + this.id + " not found.";
  }

  // Only opted-in affiliations may be surfaced to outbound workflows (consent gate).
  var affiliations = Affiliation.fetch({
    filter: Filter.eq("consentStatus", "opted_in"),
    include: "this, contact.this, company.this",
    limit: -1
  }).objs || [];

  var byKey = {};
  var candidates = affiliations.map(function (a) {
    byKey[a.id] = a;
    return {
      key: a.id,
      person: a.contact ? a.contact.name : null,
      role: a.role,
      seniority: a.seniority,
      warmth: a.warmth,
      isDecisionMaker: !!a.isDecisionMaker,
      company: a.company ? a.company.name : null,
      industry: a.company ? a.company.industry : null,
      cluster: a.company ? a.company.careerCluster : null
    };
  });

  var system =
    "You are a relationship-matching agent for a university student club. Given a topic/need and " +
    "the club's warm network (alumni affiliations, each with a warmth score 0-1 and the company " +
    "they work at), rank the people and/or companies most useful for that topic. Weigh warmth × " +
    "topical relevance; prefer decision-makers. Respond with JSON only.";

  var userPayload = {
    task: "Rank the warm-network contacts/companies most relevant to the topic.",
    topic: theTopic,
    club: { name: club.name, mission: club.mission, category: club.category },
    candidates: candidates,
    maxResults: n,
    outputSchema: {
      results: [{
        key: "string — EXACT candidate key copied from input",
        targetKind: "'person' or 'company'",
        score: "number 0-100 (usefulness for the topic)",
        rationale: "1-2 sentences: why this contact/company fits the topic, citing warmth and relevance"
      }]
    }
  };

  var results = llmComplete(system, userPayload);

  clearPriorMatches("connection", club.id);
  var matches = [];
  results.slice(0, n).forEach(function (r, idx) {
    var aff = byKey[r.key];
    if (!aff) {
      return;
    }
    var isCompany = (r.targetKind === "company") && aff.company;
    var targetType = isCompany ? "Company" : "AlumniContact";
    var targetId = isCompany ? aff.company.id : (aff.contact ? aff.contact.id : null);
    var targetName = isCompany ? aff.company.name : (aff.contact ? aff.contact.name : "");
    if (!targetId) {
      return;
    }
    matches.push(MatchResult.make({
      id: "mr_connection_" + club.id + "_" + idx,
      workflow: "connection",
      sourceType: "Club",
      sourceId: club.id,
      targetType: targetType,
      targetId: targetId,
      targetName: targetName,
      score: typeof r.score === "number" ? r.score : parseFloat(r.score) || 0,
      rationale: r.rationale || "",
      provenance: "Affiliation " + aff.id + " (warmth=" + aff.warmth + ", consent=opted_in)" +
        (aff.company ? " at " + aff.company.name : ""),
      createdTimestamp: DateTime.now()
    }));
  });

  if (matches.length > 0) {
    MatchResult.mergeBatch(matches);
  }
  logRun("findConnections", club.id, "topic=\"" + theTopic + "\"; produced " + matches.length + " matches");

  return MatchResult.fetch({
    filter: Filter.eq("workflow", "connection").and(Filter.eq("sourceId", club.id)),
    include: "this",
    order: "descending(score)",
    limit: -1
  }).objs;
}

function discoverGrants(maxResults) {
  var n = (maxResults && maxResults > 0) ? maxResults : 6;

  var club = Club.fetch({ filter: Filter.eq("id", this.id), include: "this", limit: 1 }).objs[0];
  if (!club) {
    throw "Club " + this.id + " not found.";
  }

  var grants = Grant.fetch({
    filter: Filter.ne("status", "closed"),
    include: "this",
    limit: -1
  }).objs || [];

  var byKey = {};
  var grantCtx = grants.map(function (g) {
    byKey[g.id] = g;
    return {
      key: g.id,
      name: g.name,
      source: g.source,
      amount: g.amount,
      eligibility: g.eligibility,
      targetCategories: g.targetCategories || [],
      description: g.description
    };
  });

  var system =
    "You are a grant-discovery agent for a university student club. Given the club profile and a " +
    "list of grants, rank the grants the club should pursue, judge eligibility, and for strong " +
    "matches draft a 2-3 sentence application-opening starter the officers can build on. Respond " +
    "with JSON only.";

  var userPayload = {
    task: "Rank grants for this club, check eligibility, and draft an application starter for strong fits.",
    club: { name: club.name, mission: club.mission, category: club.category, orgType: club.orgType },
    grants: grantCtx,
    maxResults: n,
    outputSchema: {
      results: [{
        key: "string — EXACT grant key copied from input",
        score: "number 0-100 (fit for this club)",
        rationale: "1-2 sentences on why it fits",
        eligible: "boolean — does the club plausibly meet the eligibility?",
        eligibilityNote: "short note on the eligibility verdict",
        draftStarter: "2-3 sentence application-opening draft (empty string if not a strong fit)"
      }]
    }
  };

  var results = llmComplete(system, userPayload);

  clearPriorMatches("grant", club.id);
  var matches = [];
  results.slice(0, n).forEach(function (r, idx) {
    var g = byKey[r.key];
    if (!g) {
      return;
    }
    matches.push(MatchResult.make({
      id: "mr_grant_" + club.id + "_" + idx,
      workflow: "grant",
      sourceType: "Club",
      sourceId: club.id,
      targetType: "Grant",
      targetId: g.id,
      targetName: g.name,
      score: typeof r.score === "number" ? r.score : parseFloat(r.score) || 0,
      rationale: r.rationale || "",
      provenance: "Grant " + g.id + " from " + (g.source || "unknown source") + "; matched on club category/mission",
      extraJson: JSON.stringify({
        eligible: !!r.eligible,
        eligibilityNote: r.eligibilityNote || "",
        draftStarter: r.draftStarter || "",
        amount: g.amount,
        deadline: g.deadline ? g.deadline.toString() : null
      }),
      createdTimestamp: DateTime.now()
    }));
  });

  if (matches.length > 0) {
    MatchResult.mergeBatch(matches);
  }
  logRun("discoverGrants", club.id, "produced " + matches.length + " grant matches");

  return MatchResult.fetch({
    filter: Filter.eq("workflow", "grant").and(Filter.eq("sourceId", club.id)),
    include: "this",
    order: "descending(score)",
    limit: -1
  }).objs;
}

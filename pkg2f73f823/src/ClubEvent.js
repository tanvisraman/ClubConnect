/*
 * ClubEvent.sourceVendors — the vendor-sourcing agent.
 *
 * Scores every ServiceProvider's menu items against the event's headcount,
 * budget, and cuisine (numeric price-fit computed in JS), then asks the platform
 * LLM to rank the best options with an explanation. Results persist as explainable
 * MatchResults (workflow = "vendor").
 */

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

function sourceVendors(maxResults) {
  var n = (maxResults && maxResults > 0) ? maxResults : 5;

  var event = ClubEvent.fetch({
    filter: Filter.eq("id", this.id),
    include: "this, club.name",
    limit: 1
  }).objs[0];
  if (!event) {
    throw "ClubEvent " + this.id + " not found.";
  }

  var headcount = event.headcount || 0;
  var budget = event.budget || 0;
  var perHeadBudget = headcount > 0 ? budget / headcount : 0;

  var providers = ServiceProvider.fetch({
    include: "this, menus.this, menus.items.this",
    limit: -1
  }).objs || [];

  var byKey = {};
  var providerCtx = providers.map(function (p) {
    byKey[p.id] = p;

    // Flatten menu items and compute the cheapest option that can serve the headcount.
    var items = [];
    (p.menus || []).forEach(function (m) {
      (m.items || []).forEach(function (it) {
        items.push({
          name: it.name,
          category: it.category,
          pricePerPerson: it.pricePerPerson,
          minimumOrder: it.minimumOrder || 0,
          dietaryTags: it.dietaryTags || []
        });
      });
    });
    var feasible = items.filter(function (it) {
      return (it.minimumOrder || 0) <= headcount && typeof it.pricePerPerson === "number";
    });
    feasible.sort(function (a, b) { return a.pricePerPerson - b.pricePerPerson; });
    var cheapest = feasible.length > 0 ? feasible[0] : null;
    var estTotal = cheapest ? cheapest.pricePerPerson * headcount : null;

    return {
      key: p.id,
      provider: p.name,
      cuisines: p.cuisines || [],
      serviceArea: p.serviceArea,
      priceLevel: p.priceLevel,
      minimumHeadcount: p.minimumHeadcount,
      rating: p.rating,
      canServeHeadcount: (p.minimumHeadcount || 0) <= headcount,
      cheapestFeasibleItem: cheapest ? cheapest.name : null,
      cheapestPerPerson: cheapest ? cheapest.pricePerPerson : null,
      estimatedTotal: estTotal,
      withinBudget: estTotal != null ? estTotal <= budget : false,
      items: items
    };
  });

  var system =
    "You are a vendor-sourcing agent for a university student club event. Given the event's " +
    "headcount, budget, and cuisine preference plus a list of catering vendors (with per-person " +
    "pricing and a precomputed price-fit), rank the best options. Favor vendors that fit the " +
    "budget, match the cuisine, can serve the headcount, and have strong ratings. Respond with JSON only.";

  var userPayload = {
    task: "Rank catering vendors by price-fit and suitability for this event.",
    event: {
      name: event.name,
      club: event.club ? event.club.name : "",
      headcount: headcount,
      budget: budget,
      perHeadBudget: Math.round(perHeadBudget * 100) / 100,
      cuisine: event.cuisine || "Any"
    },
    vendors: providerCtx,
    maxResults: n,
    outputSchema: {
      results: [{
        key: "string — EXACT vendor key copied from input",
        score: "number 0-100 (overall suitability)",
        rationale: "1-2 sentences citing price-fit, cuisine match, headcount, and rating",
        recommendedItem: "string — the menu item you'd book (copy a vendor item name)",
        estimatedTotal: "number — estimated total cost for the headcount"
      }]
    }
  };

  var client = GenaiCore.Llm.Completion.Client.forConfigKey("default-completions");
  var resp = client.completion(
    [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(userPayload) }
    ],
    { returnJson: true, max_tokens: 4096 }
  );
  var parsed = extractJson(resp.choices[0].message.content);
  var results = (parsed && parsed.results) ? parsed.results : (Array.isArray(parsed) ? parsed : []);

  // Clear prior vendor matches for this event.
  try {
    var prior = MatchResult.fetch({
      filter: Filter.eq("workflow", "vendor").and(Filter.eq("sourceId", event.id)),
      include: "this",
      limit: -1
    }).objs || [];
    if (prior.length > 0) {
      MatchResult.removeAll(Filter.eq("workflow", "vendor").and(Filter.eq("sourceId", event.id)));
    }
  } catch (e) {
    // best effort
  }

  var matches = [];
  results.slice(0, n).forEach(function (r, idx) {
    var p = byKey[r.key];
    if (!p) {
      return;
    }
    var ctx = providerCtx.filter(function (c) { return c.key === p.id; })[0] || {};
    var estTotal = typeof r.estimatedTotal === "number" ? r.estimatedTotal : ctx.estimatedTotal;
    matches.push(MatchResult.make({
      id: "mr_vendor_" + event.id + "_" + idx,
      workflow: "vendor",
      sourceType: "ClubEvent",
      sourceId: event.id,
      targetType: "ServiceProvider",
      targetId: p.id,
      targetName: p.name,
      score: typeof r.score === "number" ? r.score : parseFloat(r.score) || 0,
      rationale: r.rationale || "",
      provenance: "ServiceProvider " + p.id + "; price-fit per-head $" +
        (ctx.cheapestPerPerson != null ? ctx.cheapestPerPerson : "?") + " vs budget/head $" +
        (Math.round(perHeadBudget * 100) / 100),
      extraJson: JSON.stringify({
        recommendedItem: r.recommendedItem || ctx.cheapestFeasibleItem || null,
        estimatedTotal: estTotal != null ? estTotal : null,
        withinBudget: estTotal != null ? estTotal <= budget : ctx.withinBudget,
        rating: p.rating,
        cuisines: p.cuisines || []
      }),
      createdTimestamp: DateTime.now()
    }));
  });

  if (matches.length > 0) {
    MatchResult.mergeBatch(matches);
  }

  AuditLog.make({
    id: "audit_sourceVendors_" + event.id + "_" + DateTime.now().toString(),
    action: "sourceVendors",
    actor: "system-agent",
    targetType: "ClubEvent",
    targetId: event.id,
    timestamp: DateTime.now(),
    details: "ranked " + matches.length + " vendors for headcount=" + headcount + ", budget=" + budget
  }).merge();

  return MatchResult.fetch({
    filter: Filter.eq("workflow", "vendor").and(Filter.eq("sourceId", event.id)),
    include: "this",
    order: "descending(score)",
    limit: -1
  }).objs;
}

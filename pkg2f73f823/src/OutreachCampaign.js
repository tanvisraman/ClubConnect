/*
 * Implementation of OutreachCampaign.generateDrafts — the sponsorship-outreach agent.
 * Uses the platform LLM (GenaiCore.Llm.Completion.Client) to rank warm-intro-connected
 * companies for this campaign's packet and draft one outreach email per company.
 */

/**
 * Strip markdown code fences and isolate the first balanced JSON object/array
 * from a raw LLM response string.
 */
function extractJson(text) {
  if (text == null) {
    return null;
  }
  if (typeof text !== "string") {
    return text;
  }
  var s = text.trim();
  // remove ```json ... ``` or ``` ... ``` fences
  s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
  var start = -1;
  for (var i = 0; i < s.length; i++) {
    if (s[i] === "{" || s[i] === "[") {
      start = i;
      break;
    }
  }
  if (start === -1) {
    return JSON.parse(s);
  }
  return JSON.parse(s.substring(start));
}

function generateDrafts(maxCompanies) {
  var n = (maxCompanies && maxCompanies > 0) ? maxCompanies : 8;

  var campaign = OutreachCampaign.fetch({
    filter: Filter.eq("id", this.id),
    include: "this, packet.this, packet.club.this, club.this",
    limit: 1
  }).objs[0];
  if (!campaign || !campaign.packet) {
    throw "OutreachCampaign " + this.id + " not found, or it has no packet.";
  }
  var packet = campaign.packet;
  var club = campaign.club || packet.club;

  OutreachCampaign.make({ id: campaign.id, status: "generating" }).merge();

  // Candidate companies + their warm-intro alumni.
  var companies = Company.fetch({ include: "this, alumni.this", limit: -1 }).objs || [];

  var companyContext = companies.map(function (co) {
    var contacts = (co.alumni || []).map(function (a) {
      return {
        name: a.name,
        title: a.positionTitle,
        seniority: a.seniority,
        cluster: a.careerCluster,
        isDecisionMaker: !!a.isDecisionMaker
      };
    });
    return {
      company: co.name,
      industry: co.industry,
      cluster: co.careerCluster,
      headquarters: co.headquarters,
      alumniContacts: contacts
    };
  });

  var system =
    "You are a sponsorship-outreach analyst for a university student club. " +
    "Given the club's sponsorship packet and a list of candidate companies (each with the " +
    "club's alumni who currently work there), rank the companies that are the strongest " +
    "sponsorship fits and draft one warm, concise outreach email for each. Favor companies " +
    "whose industry/cluster aligns with the packet's targets AND that have a strong warm-intro " +
    "contact (prefer decision-makers and senior alumni). Every drafted email must open by naming " +
    "the specific alumni connection. Respond with JSON only.";

  var userPayload = {
    task: "Rank the best companies to approach for sponsorship and draft one outreach email each.",
    club: {
      name: club ? club.name : "",
      mission: club ? club.mission : ""
    },
    packet: {
      title: packet.title,
      description: packet.description,
      targetIndustries: packet.targetIndustries || [],
      targetClusters: packet.targetClusters || [],
      tiers: packet.tiersJson || ""
    },
    companies: companyContext,
    maxResults: n,
    outputSchema: {
      results: [
        {
          company: "string — EXACT company name copied from the input",
          matchScore: "number 0-100 (sponsorship fit)",
          rationale: "1-2 sentences citing industry/cluster alignment and the warm intro",
          warmIntroContact: "string — EXACT alumnus name from that company's alumniContacts, or empty string if none",
          draftSubject: "string — email subject line",
          draftBody:
            "string — a 120-160 word outreach email addressed to the warm-intro alumnus by FIRST NAME only " +
            "(e.g. 'Hi Beeki,'). It should note they are a fellow UW-Madison alum now at the company, ask them " +
            "to help connect the club with the company for sponsorship, reference the club's mission, and propose " +
            "a specific sponsorship tier. Do NOT restate the alumnus's full name in the body. If no warmIntroContact, " +
            "address it generically to the company's partnerships team."
        }
      ]
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

  var content = resp.choices[0].message.content;
  var parsed = extractJson(content);
  var results = (parsed && parsed.results) ? parsed.results : (Array.isArray(parsed) ? parsed : []);

  // Case-insensitive lookups for resolving names back to ids.
  var companyByName = {};
  var alumniByName = {};
  companies.forEach(function (co) {
    companyByName[co.name.toLowerCase()] = co;
    (co.alumni || []).forEach(function (a) {
      alumniByName[a.name.toLowerCase()] = a;
    });
  });

  // Pipeline rows that already exist for this campaign — keep their stage/$ as-is
  // and only CREATE a prospect for a company the pipeline hasn't seen yet.
  var existingProspects = SponsorProspect.fetch({
    filter: Filter.eq("campaign.id", campaign.id),
    include: "this, company.id",
    limit: -1
  }).objs || [];
  var prospectIdByCompany = {};
  existingProspects.forEach(function (p) {
    if (p.company) {
      prospectIdByCompany[p.company.id] = p.id;
    }
  });

  var messages = [];
  var newProspects = [];
  results.slice(0, n).forEach(function (r, idx) {
    var co = companyByName[(r.company || "").toLowerCase().trim()];
    if (!co) {
      return;
    }
    var warm = r.warmIntroContact
      ? alumniByName[(r.warmIntroContact || "").toLowerCase().trim()]
      : null;
    var score = typeof r.matchScore === "number" ? r.matchScore : parseFloat(r.matchScore) || 0;

    // Resolve (or create) the pipeline prospect this draft belongs to.
    var prospectId = prospectIdByCompany[co.id];
    if (!prospectId) {
      prospectId = campaign.id + "_prospect_" + co.id;
      prospectIdByCompany[co.id] = prospectId;
      newProspects.push(
        SponsorProspect.make({
          id: prospectId,
          company: { id: co.id },
          campaign: { id: campaign.id },
          stage: "contacted",
          fitScore: score,
          fitRationale: r.rationale || ""
        })
      );
    }

    messages.push(
      OutreachMessage.make({
        id: campaign.id + "_msg_" + idx,
        campaign: { id: campaign.id },
        company: { id: co.id },
        prospect: { id: prospectId },
        warmIntroContact: warm ? { id: warm.id } : null,
        matchScore: score,
        matchRationale: r.rationale || "",
        draftSubject: r.draftSubject || "",
        draftBody: r.draftBody || "",
        status: "draft"
      })
    );
  });

  if (newProspects.length > 0) {
    SponsorProspect.mergeBatch(newProspects);
  }
  if (messages.length > 0) {
    OutreachMessage.mergeBatch(messages);
  }
  OutreachCampaign.make({ id: campaign.id, status: "ready" }).merge();

  return OutreachMessage.fetch({
    filter: Filter.eq("campaign.id", campaign.id),
    include: "this, company.this, warmIntroContact.this",
    order: "descending(matchScore)",
    limit: -1
  }).objs;
}

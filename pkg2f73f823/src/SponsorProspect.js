/*
 * Implementation of SponsorProspect pipeline actions. Every stage change and
 * commitment writes an AuditLog row so the sponsorship pipeline is auditable
 * (who moved what, when), mirroring the OutreachMessage approval gate.
 */

/** Move this prospect to a new pipeline stage, stamping the last-touch time. */
function advanceStage(stage, by) {
  var who = by || "club-officer";
  var now = DateTime.now();
  SponsorProspect.make({
    id: this.id,
    stage: stage,
    lastTouchTimestamp: now
  }).merge();
  AuditLog.make({
    id: "audit_stage_" + this.id + "_" + now.toString(),
    action: "advanceStage",
    actor: who,
    approvedBy: who,
    targetType: "SponsorProspect",
    targetId: this.id,
    timestamp: now,
    details: "Prospect moved to stage '" + stage + "' by " + who
  }).merge();
  return SponsorProspect.fetch({
    filter: Filter.eq("id", this.id),
    include: "this, company.this, primaryContact.this, campaign.id",
    limit: 1
  }).objs[0];
}

/** Record a secured sponsorship commitment and move the prospect to 'committed'. */
function recordCommitment(amount, by) {
  var who = by || "club-officer";
  var now = DateTime.now();
  SponsorProspect.make({
    id: this.id,
    stage: "committed",
    committedAmount: amount,
    lastTouchTimestamp: now
  }).merge();
  AuditLog.make({
    id: "audit_commit_" + this.id + "_" + now.toString(),
    action: "recordCommitment",
    actor: who,
    approvedBy: who,
    targetType: "SponsorProspect",
    targetId: this.id,
    timestamp: now,
    details: "Commitment of $" + amount + " recorded by " + who
  }).merge();
  return SponsorProspect.fetch({
    filter: Filter.eq("id", this.id),
    include: "this, company.this, primaryContact.this, campaign.id",
    limit: 1
  }).objs[0];
}

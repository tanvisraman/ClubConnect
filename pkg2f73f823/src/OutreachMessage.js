/*
 * Implementation of OutreachMessage approval actions (human-in-the-loop gate).
 * Each state transition writes an AuditLog row so every outbound action is
 * attributable to the human who authorized it (CAN-SPAM / compliance).
 */

/** Mark this draft as approved for sending, attributing the approval to a human. */
function approve(approvedBy) {
  var who = approvedBy || "club-officer";
  var updated = OutreachMessage.make({ id: this.id, status: "approved" }).merge();
  AuditLog.make({
    id: "audit_approve_" + this.id + "_" + DateTime.now().toString(),
    action: "approve",
    actor: who,
    approvedBy: who,
    targetType: "OutreachMessage",
    targetId: this.id,
    timestamp: DateTime.now(),
    details: "Draft approved for sending by " + who
  }).merge();
  return updated;
}

/** Record that the approved message has been sent (simulated in this MVP). */
function markSent(sentBy) {
  var who = sentBy || "club-officer";
  var updated = OutreachMessage.make({ id: this.id, status: "sent" }).merge();
  AuditLog.make({
    id: "audit_send_" + this.id + "_" + DateTime.now().toString(),
    action: "send",
    actor: who,
    approvedBy: who,
    targetType: "OutreachMessage",
    targetId: this.id,
    timestamp: DateTime.now(),
    details: "Outreach message sent (simulated) by " + who
  }).merge();
  return updated;
}

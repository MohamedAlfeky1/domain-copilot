/**
 * DOMAIN COPILOT - HUMAN-IN-THE-LOOP (HITL) APPROVAL SERVICE
 * Manages consequential action approvals, edit-and-approve, rejection, and audit timeline.
 */

import { createHash } from "crypto";
import { ApprovalRequest, ApprovalEvent, RiskLevel } from "../../domain/types";
import { IDatabasePort } from "../ports/database.port";
import { ValidationError, NotFoundError } from "../../domain/errors";

export class ApprovalService {
  constructor(private db: IDatabasePort) {}

  async createApprovalRequest(params: {
    runId: string;
    toolCallId?: string;
    proposedAction: string;
    riskLevel: RiskLevel;
    requesterAgent: string;
    payload: Record<string, unknown>;
  }): Promise<ApprovalRequest> {
    const originalHash = createHash("sha256").update(JSON.stringify(params.payload)).digest("hex");
    const id = `appr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const approval: ApprovalRequest = await this.db.saveApproval({
      id,
      runId: params.runId,
      toolCallId: params.toolCallId,
      proposedAction: params.proposedAction,
      riskLevel: params.riskLevel,
      requesterAgent: params.requesterAgent,
      originalPayload: params.payload,
      originalHash,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });

    await this.db.saveApprovalEvent({
      id: `evt-${Date.now()}-1`,
      approvalId: id,
      action: "CREATED",
      newState: "PENDING",
      payloadHash: originalHash,
      reason: "Consequential action requires explicit human verification",
      timestamp: new Date().toISOString(),
    });

    return approval;
  }

  async approve(approvalId: string, reviewerId: string, comment?: string): Promise<ApprovalRequest> {
    const approval = await this.db.getApprovalById(approvalId);
    if (!approval) {
      throw new NotFoundError(`Approval request "${approvalId}" not found.`);
    }

    if (approval.status !== "PENDING") {
      return approval; // Idempotent success (HITL-003)
    }

    await this.db.updateApproval(approvalId, "APPROVED", undefined, comment, reviewerId);
    await this.db.saveApprovalEvent({
      id: `evt-${Date.now()}`,
      approvalId,
      actorId: reviewerId,
      action: "APPROVED",
      previousState: "PENDING",
      newState: "APPROVED",
      payloadHash: approval.originalHash,
      reason: comment || "Approved by human reviewer",
      timestamp: new Date().toISOString(),
    });

    approval.status = "APPROVED";
    approval.decisionComment = comment;
    approval.reviewerId = reviewerId;
    return approval;
  }

  async editAndApprove(
    approvalId: string,
    reviewerId: string,
    modifiedPayload: Record<string, unknown>,
    comment?: string
  ): Promise<ApprovalRequest> {
    const approval = await this.db.getApprovalById(approvalId);
    if (!approval) {
      throw new NotFoundError(`Approval request "${approvalId}" not found.`);
    }

    if (approval.status !== "PENDING") {
      throw new ValidationError(`Cannot edit an approval that is already in state "${approval.status}".`);
    }

    const approvedHash = createHash("sha256").update(JSON.stringify(modifiedPayload)).digest("hex");

    await this.db.updateApproval(approvalId, "EDIT_APPROVED", modifiedPayload, comment, reviewerId);
    await this.db.saveApprovalEvent({
      id: `evt-${Date.now()}`,
      approvalId,
      actorId: reviewerId,
      action: "EDITED_AND_APPROVED",
      previousState: "PENDING",
      newState: "EDIT_APPROVED",
      payloadHash: approvedHash,
      reason: comment || "Payload modified and approved by human reviewer",
      timestamp: new Date().toISOString(),
    });

    approval.status = "EDIT_APPROVED";
    approval.approvedPayload = modifiedPayload;
    approval.approvedHash = approvedHash;
    approval.decisionComment = comment;
    approval.reviewerId = reviewerId;
    return approval;
  }

  async reject(approvalId: string, reviewerId: string, reason: string): Promise<ApprovalRequest> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("Rejection requires a mandatory non-empty reason (HITL-005).");
    }

    const approval = await this.db.getApprovalById(approvalId);
    if (!approval) {
      throw new NotFoundError(`Approval request "${approvalId}" not found.`);
    }

    await this.db.updateApproval(approvalId, "REJECTED", undefined, reason, reviewerId);
    await this.db.saveApprovalEvent({
      id: `evt-${Date.now()}`,
      approvalId,
      actorId: reviewerId,
      action: "REJECTED",
      previousState: approval.status,
      newState: "REJECTED",
      payloadHash: approval.originalHash,
      reason,
      timestamp: new Date().toISOString(),
    });

    approval.status = "REJECTED";
    approval.decisionComment = reason;
    approval.reviewerId = reviewerId;
    return approval;
  }

  async getAuditTimeline(approvalId: string): Promise<ApprovalEvent[]> {
    return this.db.getApprovalEvents(approvalId);
  }
}

import { randomUUID } from "node:crypto";

import { MiniappApiError } from "./miniappApiError.mjs";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function createMiniappInMemoryRepository(options = {}) {
  const bindings = (options.bindings || []).map(clone);
  const submissions = [];
  const idempotency = new Map();
  let sequence = 0;

  return {
    async findActiveBinding({ channel, externalSubjectFingerprint }) {
      const binding = bindings.find((item) =>
        item.channel === channel &&
        item.externalSubjectFingerprint === externalSubjectFingerprint &&
        item.status === "active"
      );
      return clone(binding || null);
    },

    async getActiveBinding(bindingId) {
      const binding = bindings.find((item) => item.id === bindingId && item.status === "active");
      return clone(binding || null);
    },

    async createSubmissionWithDraft(input) {
      const replayKey = `${input.idempotencyScope}:${input.idempotencyKey}`;
      const existing = idempotency.get(replayKey);
      if (existing) {
        if (existing.requestHash !== input.requestHash) {
          throw new MiniappApiError(409, "IDEMPOTENCY_KEY_REUSED", "本次提交内容已经变化，请返回确认页后重新提交");
        }
        return { ...clone(existing.result), replayed: true };
      }

      sequence += 1;
      const date = new Date(input.receivedAt).toISOString().slice(0, 10).replaceAll("-", "");
      const orderId = `MP${date}${String(sequence).padStart(4, "0")}`;
      const draftId = `DRAFT-${orderId}`;
      const result = {
        orderId,
        intakeId: randomUUID(),
        draftId,
        status: "confirming",
        statusLabel: "工厂确认中",
        serverQuote: clone(input.serverQuote),
        inventory: clone(input.inventory),
        replayed: false,
      };
      const submission = {
        id: result.intakeId,
        bizNo: orderId,
        sourceChannel: "mini_program",
        bindingId: input.bindingId,
        customerId: input.customerId,
        externalSubmissionId: input.externalSubmissionId,
        idempotencyScope: input.idempotencyScope,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        rawPayload: clone(input.rawPayload),
        normalizedPayload: clone(input.normalizedPayload),
        serverQuote: clone(input.serverQuote),
        inventory: clone(input.inventory),
        status: "draft_created",
        draftId,
        receivedAt: input.receivedAt,
        publicOrder: {
          id: orderId,
          createdAt: input.receivedAt,
          status: "confirming",
          statusLabel: "工厂确认中",
          amount: Number(input.serverQuote.amount || 0),
          deliveryMethod: input.normalizedPayload.deliveryMethod,
          desiredDate: input.normalizedPayload.desiredDate,
          desiredTime: input.normalizedPayload.desiredTime,
          lines: clone(input.normalizedPayload.lines),
          progressNote: "价格、库存与交期正在复核",
        },
      };
      submissions.unshift(submission);
      idempotency.set(replayKey, { requestHash: input.requestHash, result });
      return clone(result);
    },

    async listOrdersForCustomer(customerId) {
      return submissions.filter((item) => item.customerId === customerId).map((item) => clone(item.publicOrder));
    },

    async getOrderForCustomer(customerId, orderId) {
      const submission = submissions.find((item) => item.customerId === customerId && item.publicOrder.id === orderId);
      return clone(submission ? submission.publicOrder : null);
    },

    inspect() {
      return { bindings: clone(bindings), submissions: clone(submissions) };
    },
  };
}

import { createStatementPreviewProjectionService } from './statementPreviewProjectionService.mjs';
import { getStatementFinancialSummary } from '../../src/domain/officeRules.js';

const preview = createStatementPreviewProjectionService();
const text = value => String(value ?? '').trim();
const rows = value => Array.isArray(value) ? value : [];
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const byNewest = (items, field) => [...items].sort((a, b) => {
  const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  return time(b[field]) - time(a[field]) || text(b.id ?? b.sendRecordId ?? b.confirmationRecordId).localeCompare(text(a.id ?? a.sendRecordId ?? a.confirmationRecordId));
});

export function buildStatementDetail(workspace, item, { includeAttachments = false } = {}) {
  const statementId = text(item.id ?? item.statementId);
  const customerId = text(item.customerId);
  const belongs = row => text(row.statementId) === statementId;
  const sourcePayments = rows(workspace.paymentRecords).filter(belongs);
  const payments = sourcePayments.filter(row => !row.customerId || text(row.customerId) === customerId).map(row => ({
    ...pick(row, ['paymentRecordId', 'statementId', 'customerId', 'amount', 'paidAt', 'method', 'status', 'operatorId', 'remark', 'confirmedBy', 'confirmedAt']),
    paymentRecordId: text(row.paymentRecordId ?? row.id),
    attachmentIds: rows(row.attachmentIds).map(text).filter(Boolean),
  }));
  const varianceRecords = rows(workspace.varianceRecords).filter(belongs).map(row => ({
    ...pick(row, ['statementId', 'paymentRecordId', 'handlingResult', 'reason', 'status', 'attachmentId', 'operatorId', 'createdAt']),
    varianceRecordId: text(row.varianceRecordId ?? row.id),
    amount: row.amount ?? row.varianceAmount ?? null,
  }));
  const writeOffRecords = byNewest(rows(workspace.statementWriteOffRecords).filter(belongs).map(row=>({
    ...pick(row,['statementId','receivableSnapshot','receivedSnapshot','varianceSnapshot','writeOffAmount','settlementKind','receiptConfirmation','handlingResult','businessDecisionId','recordedBy','createdAt','operationLogId']),
    statementWriteOffRecordId:text(row.statementWriteOffRecordId ?? row.id),
  })), 'createdAt');
  const sendRecords = byNewest(rows(workspace.statementSendRecords).filter(belongs).map(row => ({
    ...pick(row, ['statementId', 'channel', 'sentTo', 'exportFileId', 'includePaymentQr', 'sentBy', 'sentAt', 'remark', 'revision', 'receiptStatus', 'receiptAt', 'receiptBy', 'receiptNote']),
    sendRecordId: text(row.sendRecordId ?? row.id),
  })), 'sentAt');
  const sendIds = new Set(sendRecords.map(row => row.sendRecordId));
  const sourceConfirmations = rows(workspace.statementConfirmationRecords).filter(belongs);
  const confirmationRecords = byNewest(sourceConfirmations.filter(row => sendIds.has(text(row.sendRecordId))).map(row => ({
    ...pick(row, ['statementId', 'sendRecordId', 'confirmationType', 'channel', 'confirmedByCustomer', 'confirmedAt', 'content', 'recordedBy']),
    confirmationRecordId: text(row.confirmationRecordId ?? row.id),
    attachmentIds: rows(row.attachmentIds).map(text).filter(Boolean),
  })), 'confirmedAt');
  const attachments = (includeAttachments ? rows(workspace.attachments) : []).filter(row => row.ownerType === 'statement' && text(row.ownerId) === statementId
    && ['payment_screenshot', 'statement_customer_confirmation'].includes(row.purpose)).map(row => ({
    ...pick(row, ['attachmentId', 'ownerType', 'ownerId', 'fileType', 'purpose', 'fileName', 'mimeType', 'fileSize', 'status', 'uploadedBy', 'uploadedAt']),
    url: "", // Content is served only through the authenticated attachment endpoint.
    hasContent: row.hasContent === true,
  }));
  const attachmentById = new Map(attachments.map(row => [text(row.attachmentId), row]));
  const safeIds = (ids, purpose) => [...new Set(ids)].filter(id => attachmentById.get(id)?.purpose === purpose);
  for (const row of payments) row.attachmentIds = safeIds(row.attachmentIds, 'payment_screenshot');
  for (const row of confirmationRecords) row.attachmentIds = safeIds(row.attachmentIds, 'statement_customer_confirmation');
  for (const row of varianceRecords) row.attachmentId = safeIds([text(row.attachmentId)], 'payment_screenshot')[0] || '';
  const targetIds = new Map([
    ['statement', new Set([statementId])],
    ['statement_send_record', sendIds],
    ['payment_record', new Set(payments.map(row => row.paymentRecordId))],
    ['variance_record', new Set(varianceRecords.map(row => row.varianceRecordId))],
    ['statement_write_off_record', new Set(writeOffRecords.map(row=>row.statementWriteOffRecordId))],
  ]);
  const operationLogs = rows(workspace.operationLogs).filter(row => targetIds.get(row.targetType)?.has(text(row.targetId)))
    .map(row => ({ ...pick(row, ['id', 'targetType', 'targetId', 'action', 'reason', 'operatorId', 'occurredAt', 'createdAt']), operationLogId: text(row.operationLogId ?? row.id) }));
  const latestSend = sendRecords[0];
  const latestConfirmation = confirmationRecords[0];
  const paymentAttachmentIds = safeIds(payments.flatMap(row => row.attachmentIds), 'payment_screenshot');
  const customerConfirmationAttachmentIds = safeIds(confirmationRecords.flatMap(row => row.attachmentIds), 'statement_customer_confirmation');
  const receiptLabels = { pending: '待回执', delivered: '已送达', read: '客户已读', confirmed: '客户已确认', no_response: '未回复' };
  const statement = {
    ...item, ...getStatementFinancialSummary(item, workspace.customers), statementId,
    customerName: text(item.customerName || rows(workspace.customers).find(row => text(row.id ?? row.customerId) === customerId)?.name),
    sent: Boolean(latestSend), sendRecordId: latestSend?.sendRecordId || '',
    sendRecordRevision: latestSend?.revision ?? null,
    sentAt: latestSend?.sentAt || '', sendChannel: latestSend?.channel || '', sendRecipient: latestSend?.sentTo || '',
    sendOperator: latestSend?.sentBy || '', sendReceiptStatus: latestSend ? receiptLabels[latestSend.receiptStatus] || '待回执' : '',
    sendReceiptAt: latestSend?.receiptAt || '', sendReceiptBy: latestSend?.receiptBy || '', sendReceiptNote: latestSend?.receiptNote || '',
    customerConfirmationStatus: latestConfirmation ? '客户已确认' : '',
    customerConfirmedAt: latestConfirmation?.confirmedAt || '', customerConfirmedBy: latestConfirmation?.confirmedByCustomer || '',
    customerConfirmationContent: latestConfirmation?.content || '', customerConfirmationChannel: latestConfirmation?.channel || '',
    paymentAttachmentIds, paymentAttachmentFiles: paymentAttachmentIds.map(id => attachmentById.get(id)),
    customerConfirmationAttachmentIds, customerConfirmationAttachmentFiles: customerConfirmationAttachmentIds.map(id => attachmentById.get(id)),
  };
  const customer = rows(workspace.customers).find(row => text(row.id ?? row.customerId) === customerId);
  return {
    ...statement, // Keep existing flat clients compatible while supplying the documented detail envelope.
    statement,
    customer: customer ? { customerId, customerName: text(customer.name ?? customer.customerName), settlementCycle: text(customer.settlementCycle ?? customer.cycle), statementId } : null,
    lines: preview.buildPreviewLines(workspace, item),
    lineSource: rows(workspace.statementLines).some(row => text(row.statementId ?? row.statement_id) === statementId) ? 'persisted_statement' : 'linked_order',
    payments: byNewest(payments, 'paidAt'), varianceRecords, writeOffRecords, sendRecords, confirmationRecords, attachments, operationLogs,
    evidenceWarnings: {
      mismatchedCustomerPaymentCount: sourcePayments.length - payments.length,
      unlinkedConfirmationCount: sourceConfirmations.length - confirmationRecords.length,
    },
  };
}

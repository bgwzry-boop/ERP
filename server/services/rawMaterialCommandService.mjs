import { createHash, randomUUID } from "node:crypto";

export function createRawMaterialCommandService(dependencies = {}) {
  const {
    attachmentCreateCommandService,
    businessDecisionEvidenceService,
    buildOperationLog,
    nextId,
    now = () => new Date(),
    logger = console,
    rawMaterialOcrParserService,
    scheduleTask = (task) => queueMicrotask(task),
    sleep = defaultSleep,
    tencentCloudTableOcrService,
  } = dependencies;
  const deliveryNoteOcrJobs = new Map();

  const service = {
    async recognizeDeliveryNote({ workspace, body = {}, operatorId, ocrPageCache = [], onPageProgress }) {
      try {
        requireOcrDependencies({
          attachmentCreateCommandService,
          buildOperationLog,
          nextId,
          rawMaterialOcrParserService,
          tencentCloudTableOcrService,
        });
        const normalizedPages = normalizeDeliveryNotePages(body);
        const deliveryNotePages = await Promise.all(normalizedPages.map((page, sourcePageIndex) =>
          resolveDeliveryNoteOcrPage({ workspace, page, sourcePageIndex, operatorId })
        ));
        if (!deliveryNotePages.length) {
          return {
            error: true,
            statusCode: 422,
            code: "RAW_MATERIAL_DELIVERY_NOTE_REQUIRED",
            message: "请选择原材料送货单照片或 PDF 后再识别。",
          };
        }
        const sourceEvidence = await Promise.all(deliveryNotePages.map((page, sourcePageIndex) =>
          resolveDeliveryNoteSourceEvidence({ workspace, page, sourcePageIndex, operatorId })
        ));
        const pageSourceDigests = sourceEvidence.map((item) => item.contentDigest);
        if (new Set(pageSourceDigests).size !== pageSourceDigests.length) {
          return {
            error: true,
            statusCode: 422,
            code: "RAW_MATERIAL_DELIVERY_NOTE_DUPLICATE_PAGE",
            message: "同一张照片被重复添加了，请删除重复页后再识别。",
          };
        }
        const sourceDigest = deliveryNotePages.length === 1
          ? pageSourceDigests[0]
          : createHash("sha256").update(`raw-material-pages-v1\n${pageSourceDigests.join("\n")}`).digest("hex");
        const existingInbound = (Array.isArray(workspace.rawMaterialInbounds) ? workspace.rawMaterialInbounds : []).find(
          (item) => cleanText(item?.ocrSourceDigest) === sourceDigest,
        );
        if (existingInbound) {
          const reparsed = await reparseStaleOcrDraft({
            documentDirectionHint: body.documentDirectionHint,
            supplierNameHint: body.supplierNameHint,
            existingInbound,
            operatorId,
            rawMaterialOcrParserService,
            sourceDigest,
            workspace,
          });
          return {
            inbound: reparsed.inbound,
            attachmentId: cleanText(reparsed.inbound.sourceAttachmentId),
            attachmentIds: normalizeTextArray(reparsed.inbound.sourceAttachmentIds, reparsed.inbound.sourceAttachmentId),
            deduplicated: true,
            operationLogId: reparsed.operationLogId,
          };
        }

        const recognizedAt = new Date().toISOString();
        const inboundId = `RMI-OCR-${sourceDigest.slice(0, 12).toUpperCase()}`;
        // Tencent's table OCR endpoint applies a low request-rate limit. Keep
        // the physical pages in source order and retry only transient provider
        // throttling; concurrent multi-page calls can otherwise reject a valid
        // delivery note before a draft is created.
        const ocrPages = [];
        for (const [sourcePageIndex, page] of deliveryNotePages.entries()) {
          onPageProgress?.({
            phase: "recognizing",
            current: sourcePageIndex + 1,
            total: deliveryNotePages.length,
            message: `第 ${sourcePageIndex + 1}/${deliveryNotePages.length} 页处理中…`,
          });
          const cachedPage = ocrPageCache[sourcePageIndex];
          if (cachedPage) {
            ocrPages.push(cachedPage);
            continue;
          }
          try {
            const pageOcr = await recognizeDeliveryNotePageWithRetry({
              page,
              sleep,
              tencentCloudTableOcrService,
            });
            const normalizedPage = normalizeOcrPageResult(pageOcr, sourcePageIndex);
            ocrPageCache[sourcePageIndex] = normalizedPage;
            ocrPages.push(normalizedPage);
          } catch (error) {
            throw Object.assign(new Error(`送货单第 ${sourcePageIndex + 1} 页识别失败，可只重试这一页，不需要重新上传整张单。`), {
              statusCode: 502,
              code: "RAW_MATERIAL_DELIVERY_NOTE_PAGE_OCR_FAILED",
              cause: error,
              details: { failedPageNumber: sourcePageIndex + 1, pageCount: deliveryNotePages.length },
            });
          }
        }
        const ocr = combineOcrPageResults(ocrPages);
        const draft = rawMaterialOcrParserService.buildInboundDraft({
          colorAliases: workspace.colorAliases,
          documentDirectionHint: body.documentDirectionHint,
          inboundId,
          knownSupplierNames: collectKnownSupplierNames(workspace),
          ocr,
          recognizedAt,
          standardColors: workspace.standardColors,
          supplierNameHint: body.supplierNameHint,
        });
        const documentDuplicateKey = buildRawMaterialDeliveryNoteDuplicateKey(draft);
        const duplicateCandidates = findRawMaterialDeliveryNoteDuplicates(
          workspace.rawMaterialInbounds,
          draft,
        );
        const duplicateConfirmation = validateRawMaterialDeliveryNoteDuplicateConfirmation({
          body,
          documentDuplicateKey,
          duplicateCandidates,
          sourceDigest,
        });
        if (duplicateCandidates.length && !duplicateConfirmation.confirmed) {
          return {
            error: true,
            statusCode: 409,
            code: "RAW_MATERIAL_DELIVERY_NOTE_DUPLICATE_CONFIRMATION_REQUIRED",
            message: `供应商“${cleanText(draft.supplierName)}”的单据 ${cleanText(draft.deliveryNoteNo)} 已录入过，请确认是否确为另一张需要保留的送货单。系统不会自动合并。`,
            details: {
              supplierName: cleanText(draft.supplierName),
              deliveryNoteNo: cleanText(draft.deliveryNoteNo),
              duplicateInboundIds: duplicateCandidates.map((item) => cleanText(item.id)).filter(Boolean),
              duplicateStatuses: duplicateCandidates.map((item) => cleanText(item.status)).filter(Boolean),
              confirmationToken: buildRawMaterialDeliveryNoteDuplicateConfirmationToken({
                documentDuplicateKey,
                duplicateCandidates,
                sourceDigest,
              }),
            },
          };
        }
        const attachmentResults = [];
        for (const [sourcePageIndex, page] of deliveryNotePages.entries()) {
          const uploadedSource = sourceEvidence[sourcePageIndex]?.attachment;
          if (uploadedSource) {
            attachmentResults.push({ ok: true, attachment: uploadedSource, deduplicated: false, reusedSource: true });
            continue;
          }
          const ocrPayloadDigest = createHash("sha256").update(page.contentDataUrl).digest("hex");
          const attachmentSourceKey = deliveryNotePages.length === 1
            ? `raw-material-ocr-source:${sourceDigest}`
            : `raw-material-ocr-source:${sourceDigest}:page:${sourcePageIndex + 1}:${pageSourceDigests[sourcePageIndex]}`;
          const attachmentResult = await attachmentCreateCommandService.createAttachment({
            workspace,
            operatorId,
            body: {
            ownerType: "raw_material_inbound",
            ownerId: inboundId,
            fileType: inferSourceFileType(page.sourceMimeType || page.mimeType, page.fileName),
            purpose: "raw_material_delivery_note",
            fileName: cleanText(page.fileName) || `原材料送货单-${inboundId}-第${sourcePageIndex + 1}页`,
            contentRef: attachmentSourceKey,
            contentDataUrl: page.sourceContentDataUrl,
            mimeType: cleanText(page.sourceMimeType || page.mimeType),
            fileSize: Number(page.sourceFileSize || page.fileSize) || undefined,
            idempotencyKey: attachmentSourceKey,
            metadata: {
              ocrProvider: draft.ocrProvider,
              ocrAction: draft.ocrAction,
              ocrRequestId: ocrPages[sourcePageIndex]?.requestId || draft.ocrRequestId,
              ocrPayloadDigest,
              ocrPayloadMimeType: cleanText(page.mimeType),
              ocrPayloadFileSize: Number(page.fileSize) || undefined,
              sourceNormalizedForOcr: page.sourceNormalizedForOcr === true,
              sourcePageIndex,
              pageNumber: sourcePageIndex + 1,
              pageCount: deliveryNotePages.length,
            },
            remark: `原材料送货单 OCR 原图第 ${sourcePageIndex + 1}/${deliveryNotePages.length} 页；只用于办公室人工复核，不直接形成可用库存。`,
          },
          });
          if (!attachmentResult?.ok) {
            throw Object.assign(new Error(attachmentResult?.message || `原材料送货单第 ${sourcePageIndex + 1} 页附件保存失败。`), {
              statusCode: attachmentResult?.statusCode || 422,
              code: attachmentResult?.errorCode || "RAW_MATERIAL_DELIVERY_NOTE_ATTACHMENT_FAILED",
            });
          }
          attachmentResults.push(attachmentResult);
        }
        const sourceAttachmentIds = attachmentResults.map((result) => cleanText(result.attachment?.attachmentId)).filter(Boolean);
        const inbound = {
          ...draft,
          documentDuplicateKey,
          duplicateDocumentConfirmation: duplicateConfirmation.confirmed
            ? {
                confirmed: true,
                confirmedBy: cleanText(operatorId),
                confirmedAt: recognizedAt,
                duplicateInboundIds: duplicateCandidates.map((item) => cleanText(item.id)).filter(Boolean),
              }
            : null,
          ocrSourceDigest: sourceDigest,
          sourceAttachmentId: sourceAttachmentIds[0] || "",
          sourceAttachmentIds,
          sourceFileName: cleanText(deliveryNotePages[0]?.fileName),
          sourceFileNames: deliveryNotePages.map((page) => cleanText(page.fileName)),
          sourceMimeType: cleanText(deliveryNotePages[0]?.sourceMimeType || deliveryNotePages[0]?.mimeType),
          sourceMimeTypes: deliveryNotePages.map((page) => cleanText(page.sourceMimeType || page.mimeType)),
        };
        const operationLog = buildOperationLog(workspace, {
          id: nextId("LOG", workspace.operationLogs ?? []),
          targetType: "raw_material_inbound",
          targetId: inboundId,
          action: "recognize_raw_material_delivery_note",
          operatorId,
          before: null,
          after: {
            inboundId,
            sourceAttachmentId: inbound.sourceAttachmentId,
            sourceAttachmentIds,
            ocrPageCount: deliveryNotePages.length,
            ocrProvider: inbound.ocrProvider,
            ocrAction: inbound.ocrAction,
            ocrRequestId: inbound.ocrRequestId,
            status: inbound.status,
            reviewFieldCount: inbound.ocrReviewFields.length,
            lineCount: inbound.ocrLines.length,
          },
          reason: "腾讯云表格识别 V3 生成原材料送货单待人工复核草稿",
        });
        const saved = await workspace.rawMaterialInboundRepository.createRawMaterialInboundDraft({
          workspace,
          inbound,
          operationLog,
          idempotencyKey: `raw-material-ocr:${sourceDigest}`,
          idempotencyPayload: { sourceDigest, inboundId },
          operatorId,
        });
        appendOperationLog(workspace, saved.operationLog);
        return {
          inbound: saved.inbound,
          attachmentId: inbound.sourceAttachmentId,
          attachmentIds: sourceAttachmentIds,
          deduplicated: saved.deduplicated === true,
          operationLogId: saved.operationLogId ?? saved.operationLog?.id ?? "",
        };
      } catch (error) {
        const safeError = toSafeRawMaterialOcrError(error);
        if (safeError.redacted || safeError.statusCode >= 500) {
          logger?.error?.("Raw-material delivery-note OCR failed", {
            code: cleanText(error?.code),
            message: cleanText(error?.message),
            causeCode: cleanText(error?.cause?.code),
            causeMessage: cleanText(error?.cause?.message),
          });
        }
        return {
          error: true,
          statusCode: safeError.statusCode,
          code: safeError.code,
          message: safeError.message,
          details: safeError.details,
        };
      }
    },

    async startDeliveryNoteRecognitionJob({ workspace, body = {}, operatorId }) {
      pruneDeliveryNoteOcrJobs(deliveryNoteOcrJobs, now());
      await cleanupAbandonedRawMaterialCaptureAttachments({ workspace, now: now(), buildOperationLog, nextId, operatorId, logger });
      const jobId = `RMOJ-${randomUUID()}`;
      const job = {
        jobId,
        operatorId: cleanText(operatorId),
        status: "queued",
        body: cloneJobBody(body),
        ocrPageCache: [],
        currentPage: 0,
        pageCount: Array.isArray(body.pages) ? body.pages.length : 1,
        createdAt: toIsoTimestamp(now()),
        updatedAt: toIsoTimestamp(now()),
        result: null,
      };
      deliveryNoteOcrJobs.set(jobId, job);
      scheduleTask(() => runDeliveryNoteOcrJob({ service, workspace, job, now, logger }));
      return { job: projectDeliveryNoteOcrJob(job) };
    },

    async getDeliveryNoteRecognitionJob({ jobId, operatorId }) {
      try {
        const job = requireOwnedDeliveryNoteOcrJob(deliveryNoteOcrJobs, jobId, operatorId);
        return { job: projectDeliveryNoteOcrJob(job) };
      } catch (error) {
        return toRawMaterialOcrCommandError(error);
      }
    },

    async retryDeliveryNoteRecognitionJob({ workspace, jobId, body = {}, operatorId }) {
      try {
        const job = requireOwnedDeliveryNoteOcrJob(deliveryNoteOcrJobs, jobId, operatorId);
        if (!["failed", "needs_confirmation"].includes(job.status)) {
          return {
            error: true,
            statusCode: 409,
            code: "RAW_MATERIAL_DELIVERY_NOTE_JOB_NOT_RETRYABLE",
            message: "当前识别任务不需要重试。",
          };
        }
        if (cleanText(body.duplicateConfirmationToken)) {
          job.body.duplicateConfirmationToken = cleanText(body.duplicateConfirmationToken);
        }
        job.status = "queued";
        job.error = null;
        job.updatedAt = toIsoTimestamp(now());
        scheduleTask(() => runDeliveryNoteOcrJob({ service, workspace, job, now, logger }));
        return { job: projectDeliveryNoteOcrJob(job) };
      } catch (error) {
        return toRawMaterialOcrCommandError(error);
      }
    },

    async recordInboundAction({ workspace, inboundId, actionSlug, body = {}, operatorId }) {
      try {
        const expectedRevision = requireExpectedRevision(body.expectedRevision);
        const serverNow = toIsoTimestamp(now());
        const result = await workspace.rawMaterialInboundRepository.recordRawMaterialInboundAction({
          workspace,
          inboundId,
          action: actionSlug,
          body: { ...body, expectedRevision },
          idempotencyKey: body.idempotencyKey,
          idempotencyPayload: body,
          operatorId,
          operatorName: getOperatorName(workspace, operatorId),
          serverNow,
        });
        appendOperationLog(workspace, result.operationLog);
        return {
          inbound: result.inbound,
          operationLogId: result.operationLogId ?? result.operationLog?.id ?? "",
        };
      } catch (error) {
        const statusCode = normalizeStatusCode(error?.statusCode);
        const details = error?.details ?? (error?.currentRevision ? { currentRevision: error.currentRevision } : undefined);
        return {
          error: true,
          statusCode,
          code:
            cleanText(error?.code) ||
            (statusCode === 404
              ? "RAW_MATERIAL_INBOUND_NOT_FOUND"
              : "RAW_MATERIAL_INBOUND_ACTION_FAILED"),
          message: cleanText(error?.message) || "Raw material inbound action failed.",
          ...(details ? { details } : {}),
        };
      }
    },

    async createPurchaseRequest({ workspace, body = {}, operatorId, actionPermissions = [] }) {
      try {
        requirePurchaseDependencies({ businessDecisionEvidenceService, buildOperationLog, nextId });
        const materialLines = normalizePurchaseMaterialLines(body.materialLines);
        const supplierNameSnapshot = cleanText(body.supplierNameSnapshot ?? body.supplierName);
        if (!supplierNameSnapshot || materialLines.length === 0) {
          return purchaseValidation(
            "RAW_MATERIAL_PURCHASE_FIELDS_REQUIRED",
            "请填写供应商，并至少添加一条数量大于 0 的采购物料。",
          );
        }
        const requestId = cleanText(body.requestId) || buildPurchaseRequestId(body.idempotencyKey, workspace, nextId);
        const createdAt = toIsoTimestamp(now());
        const purchaseRequestBase = {
          id: requestId,
          requestId,
          supplierId: cleanText(body.supplierId),
          supplierNameSnapshot,
          materialLines,
          requiredAt: normalizeOptionalTimestamp(body.requiredAt),
          status: "待执行",
          businessDecisionId: "",
          createdBy: operatorId,
          revision: 1,
          createdAt,
          updatedAt: createdAt,
        };
        const idempotencyPayload = buildPurchaseIdempotencyPayload(body, purchaseRequestBase);
        const replay = await workspace.rawMaterialPurchaseRepository.findIdempotentReplay?.({
          workspace,
          scope: "raw_material.purchase.create",
          idempotencyKey: body.idempotencyKey,
          idempotencyPayload,
        });
        if (replay) {
          return {
            purchaseRequest: replay.purchaseRequest,
            businessDecision: businessDecisionEvidenceService.toProjection(replay.businessDecision),
            operationLogId: replay.operationLogId,
            replayed: true,
          };
        }
        const operationLog = buildOperationLog(workspace, {
          targetType: "raw_material_purchase_request",
          targetId: requestId,
          action: "create_raw_material_purchase_request",
          operatorId,
          pageKey: "raw_materials",
          before: null,
          after: {
            requestId,
            supplierNameSnapshot,
            materialLines,
            status: "待执行",
          },
          reason: "按已授权业务决定创建原材料采购请求",
        });
        const decision = businessDecisionEvidenceService.prepareDecision({
          workspace,
          businessType: "raw_material_purchase_request",
          businessId: requestId,
          decisionScope: "raw_material_purchase",
          operatorId,
          actionPermissions,
          delegatedDecision: body.delegatedDecision,
          directDecisionContent: body.directDecisionContent,
          operationLogId: operationLog.id,
          idempotencyKey: body.idempotencyKey,
        });
        if (decision.error) return decision;
        const purchaseRequest = {
          ...purchaseRequestBase,
          businessDecisionId: decision.record.id,
        };
        operationLog.after.businessDecisionId = decision.record.id;
        const saved = await workspace.rawMaterialPurchaseRepository.createPurchaseRequest({
          workspace,
          purchaseRequest,
          decisionRecord: decision.record,
          attachmentLinks: decision.attachmentLinks,
          operationLog,
          idempotencyKey: body.idempotencyKey,
          idempotencyPayload,
        });
        return {
          purchaseRequest: saved.purchaseRequest,
          businessDecision: businessDecisionEvidenceService.toProjection(saved.businessDecision ?? decision.record),
          operationLogId: saved.operationLogId ?? operationLog.id,
          replayed: saved.replayed === true,
        };
      } catch (error) {
        return toPurchaseError(error, "RAW_MATERIAL_PURCHASE_CREATE_FAILED", "原材料采购请求创建失败。");
      }
    },

    async updatePurchaseRequestStatus({ workspace, requestId, body = {}, operatorId, actionPermissions = [] }) {
      try {
        requirePurchaseDependencies({ businessDecisionEvidenceService, buildOperationLog, nextId });
        const current = await workspace.rawMaterialPurchaseRepository.getPurchaseRequest({ workspace, requestId });
        if (!current) return purchaseError(404, "RAW_MATERIAL_PURCHASE_NOT_FOUND", "原材料采购请求不存在。");
        const expectedRevision = requireExpectedRevision(body.expectedRevision);
        const status = cleanText(body.status);
        const possibleReplay = status === current.status && expectedRevision < current.revision;
        if (!possibleReplay && !purchaseStatusTransitions[current.status]?.includes(status)) {
          return purchaseValidation("RAW_MATERIAL_PURCHASE_STATUS_INVALID", `不能从“${current.status}”变更为“${status || "空状态"}”。`);
        }
        const updatedAt = toIsoTimestamp(now());
        const operationLog = buildOperationLog(workspace, {
          targetType: "raw_material_purchase_request",
          targetId: current.id,
          action: status === "已取消" ? "cancel_raw_material_purchase_request" : "update_raw_material_purchase_status",
          operatorId,
          pageKey: "raw_materials",
          before: { status: current.status, revision: current.revision },
          after: { status, revision: current.revision + 1 },
          reason: cleanText(body.reason) || `采购请求状态更新为${status}`,
        });
        let decision = null;
        if (status === "已取消") {
          decision = businessDecisionEvidenceService.prepareDecision({
            workspace,
            businessType: "raw_material_purchase_request",
            businessId: current.id,
            decisionScope: "raw_material_purchase",
            operatorId,
            actionPermissions,
            delegatedDecision: body.delegatedDecision,
            directDecisionContent: body.directDecisionContent,
            operationLogId: operationLog.id,
            supersedesDecisionId: cleanText(body.supersedesDecisionId),
            idempotencyKey: body.idempotencyKey,
          });
          if (decision.error) return decision;
          operationLog.after.businessDecisionId = decision.record.id;
        }
        const saved = await workspace.rawMaterialPurchaseRepository.updatePurchaseRequestStatus({
          workspace,
          purchaseRequest: { ...current, status, expectedRevision, updatedAt },
          decisionRecord: decision?.record,
          attachmentLinks: decision?.attachmentLinks ?? [],
          operationLog,
          idempotencyKey: body.idempotencyKey,
          idempotencyPayload: {
            requestId: current.id,
            expectedRevision,
            status,
            reason: cleanText(body.reason),
            delegatedDecision: body.delegatedDecision ?? null,
            directDecisionContent: body.directDecisionContent ?? null,
          },
        });
        return {
          purchaseRequest: saved.purchaseRequest,
          businessDecision: saved.businessDecision
            ? businessDecisionEvidenceService.toProjection(saved.businessDecision)
            : null,
          operationLogId: saved.operationLogId ?? operationLog.id,
          replayed: saved.replayed === true,
        };
      } catch (error) {
        return toPurchaseError(error, "RAW_MATERIAL_PURCHASE_STATUS_UPDATE_FAILED", "原材料采购状态更新失败。");
      }
    },

    async createSupplierStatementReviewDraft({ workspace, body = {}, operatorId }) {
      const statementResult = body.statementResult ?? body.result;
      if (!statementResult || typeof statementResult !== "object") {
        return {
          error: true,
          statusCode: 422,
          code: "VALIDATION_ERROR",
          message: "statementResult is required",
        };
      }
      const result = await workspace.rawMaterialSupplierStatementReviewRepository.createReviewDraft({
        workspace,
        statementResult,
        fileName: body.fileName,
        supplierName: body.supplierName,
        note: body.note,
        now: body.now,
        operatorId,
        operatorName: getOperatorName(workspace, operatorId),
      });
      appendOperationLog(workspace, result.operationLog);
      return {
        review: result.review,
        operationLogId: getOperationLogId(result),
      };
    },

    async confirmSupplierStatementReview({ workspace, reviewId, body = {}, operatorId }) {
      const result = await workspace.rawMaterialSupplierStatementReviewRepository.confirmReview({
        workspace,
        reviewId,
        decision: body.decision,
        adjustments: body.adjustments,
        note: body.note,
        now: body.now,
        operatorId,
        operatorName: getOperatorName(workspace, operatorId),
      });
      appendOperationLog(workspace, result.operationLog);
      return {
        review: result.review,
        operationLogId: getOperationLogId(result),
      };
    },

    async confirmSupplierStatement({ workspace, reviewId, body = {}, operatorId }) {
      const result = await workspace.rawMaterialSupplierStatementReviewRepository.confirmStatement({
        workspace,
        reviewId,
        note: body.note,
        now: body.now,
        operatorId,
        operatorName: getOperatorName(workspace, operatorId),
      });
      appendOperationLog(workspace, result.operationLog);
      return {
        review: result.review,
        operationLogId: getOperationLogId(result),
      };
    },

    async generateSupplierPayableDraft({ workspace, reviewId, body = {}, operatorId }) {
      const result = await workspace.rawMaterialSupplierStatementReviewRepository.generatePayableDraft({
        workspace,
        reviewId,
        note: body.note,
        now: body.now,
        operatorId,
        operatorName: getOperatorName(workspace, operatorId),
      });
      appendOperationLog(workspace, result.operationLog);
      return {
        review: result.review,
        payableDraft: result.payableDraft,
        operationLogId: getOperationLogId(result),
      };
    },

    async confirmSupplierPayment({ workspace, reviewId, body = {}, operatorId }) {
      const result = await workspace.rawMaterialSupplierStatementReviewRepository.confirmPayment({
        workspace,
        reviewId,
        paidAmount: body.paidAmount ?? body.amount,
        paymentMethod: body.paymentMethod,
        paymentAccount: body.paymentAccount,
        paymentReferenceNo: body.paymentReferenceNo,
        paymentVoucherNo: body.paymentVoucherNo,
        paidAt: body.paidAt,
        note: body.note,
        now: body.now,
        operatorId,
        operatorName: getOperatorName(workspace, operatorId),
      });
      appendOperationLog(workspace, result.operationLog);
      return {
        review: result.review,
        paymentRecord: result.paymentRecord,
        operationLogId: getOperationLogId(result),
      };
    },
  };
  return service;
}

async function runDeliveryNoteOcrJob({ service, workspace, job, now, logger }) {
  if (job.running) return;
  job.running = true;
  job.status = "recognizing";
  job.updatedAt = toIsoTimestamp(now());
  try {
    const result = await service.recognizeDeliveryNote({
      workspace,
      body: job.body,
      operatorId: job.operatorId,
      ocrPageCache: job.ocrPageCache,
      onPageProgress(progress) {
        job.currentPage = Number(progress?.current) || job.currentPage;
        job.pageCount = Number(progress?.total) || job.pageCount;
        job.message = cleanText(progress?.message);
        job.updatedAt = toIsoTimestamp(now());
      },
    });
    job.result = result;
    job.error = result?.error ? {
      statusCode: result.statusCode,
      code: result.code,
      message: result.message,
      details: { ...(result.details ?? {}), jobId: job.jobId },
    } : null;
    job.status = result?.error
      ? result.code === "RAW_MATERIAL_DELIVERY_NOTE_DUPLICATE_CONFIRMATION_REQUIRED"
        ? "needs_confirmation"
        : "failed"
      : "completed";
    if (job.status === "completed") job.currentPage = job.pageCount;
  } catch (error) {
    logger?.error?.("Raw-material delivery-note OCR job crashed", {
      jobId: job.jobId,
      code: cleanText(error?.code),
      message: cleanText(error?.message),
    });
    job.status = "failed";
    job.error = {
      statusCode: 500,
      code: "RAW_MATERIAL_DELIVERY_NOTE_JOB_FAILED",
      message: "送货单后台识别任务异常，请直接重试，不需要重新上传。",
      details: { jobId: job.jobId },
    };
  } finally {
    job.running = false;
    job.updatedAt = toIsoTimestamp(now());
  }
}

function projectDeliveryNoteOcrJob(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    currentPage: Number(job.currentPage) || 0,
    pageCount: Number(job.pageCount) || 0,
    message: cleanText(job.message),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error ?? undefined,
    result: job.status === "completed" ? job.result : undefined,
  };
}

function requireOwnedDeliveryNoteOcrJob(jobs, jobId, operatorId) {
  const job = jobs.get(cleanText(jobId));
  if (!job || cleanText(job.operatorId) !== cleanText(operatorId)) {
    throw Object.assign(new Error("识别任务不存在或不属于当前操作人，请重新选择送货单。"), {
      statusCode: 404,
      code: "RAW_MATERIAL_DELIVERY_NOTE_JOB_NOT_FOUND",
    });
  }
  return job;
}

function pruneDeliveryNoteOcrJobs(jobs, nowValue) {
  const cutoff = new Date(nowValue).getTime() - 24 * 60 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (Date.parse(job.updatedAt || job.createdAt) < cutoff) jobs.delete(jobId);
  }
}

function cloneJobBody(body) {
  return JSON.parse(JSON.stringify(body ?? {}));
}

async function cleanupAbandonedRawMaterialCaptureAttachments({ workspace, now: nowValue, buildOperationLog, nextId, operatorId, logger }) {
  const repository = workspace?.attachmentRepository;
  if (typeof repository?.listAttachments !== "function" || typeof repository?.voidAttachment !== "function") return;
  const nowMs = new Date(nowValue).getTime();
  const fallbackCutoff = nowMs - 48 * 60 * 60 * 1000;
  const referencedIds = new Set((workspace.rawMaterialInbounds ?? []).flatMap((item) =>
    normalizeTextArray(item?.sourceAttachmentIds, item?.sourceAttachmentId)
  ));
  try {
    const candidates = await repository.listAttachments({ workspace, filters: {
      ownerType: "raw_material_inbound_capture",
      purpose: "raw_material_delivery_note",
    } });
    const expired = (Array.isArray(candidates) ? candidates : []).filter((attachment) => {
      if (attachment.status !== "uploaded" || referencedIds.has(cleanText(attachment.attachmentId))) return false;
      const explicitExpiry = Date.parse(cleanText(attachment.metadata?.expiresAt));
      const uploadedAt = Date.parse(cleanText(attachment.uploadedAt));
      return Number.isFinite(explicitExpiry)
        ? explicitExpiry <= nowMs
        : Number.isFinite(uploadedAt) && uploadedAt <= fallbackCutoff;
    }).slice(0, 50);
    for (const attachment of expired) {
      const operationLog = buildOperationLog(workspace, {
        id: nextId("LOG", workspace.operationLogs ?? []),
        targetType: "raw_material_inbound_capture",
        targetId: attachment.ownerId,
        action: "cleanup_abandoned_raw_material_capture",
        operatorId,
        before: { attachmentId: attachment.attachmentId, status: attachment.status },
        after: { attachmentId: attachment.attachmentId, status: "voided" },
        reason: "送货单临时附件超过 48 小时且未关联入库草稿，按临时附件保留规则清理。",
      });
      await repository.voidAttachment({
        workspace,
        attachmentId: attachment.attachmentId,
        ownerType: attachment.ownerType,
        ownerId: attachment.ownerId,
        purpose: attachment.purpose,
        operationLog,
        idempotencyKey: `raw-material-capture-cleanup:${attachment.attachmentId}`,
        idempotencyPayload: { attachmentId: attachment.attachmentId, uploadedAt: attachment.uploadedAt },
      });
      if (attachment.storageKey) {
        await workspace.attachmentObjectStorage?.deleteObject?.({ storageKey: attachment.storageKey });
      }
    }
  } catch (error) {
    logger?.error?.("Raw-material capture cleanup failed", {
      code: cleanText(error?.code),
      message: cleanText(error?.message),
    });
  }
}

function toSafeRawMaterialOcrError(error) {
  const statusCode = normalizeStatusCode(error?.statusCode);
  const rawCode = cleanText(error?.code) || "RAW_MATERIAL_DELIVERY_NOTE_OCR_FAILED";
  const rawMessage = cleanText(error?.message);
  const unsafe = /(?:foreign key|constraint|sqlstate|insert\s+or\s+update|relation\s+.+does not exist|request body exceeds|load failed|failed to fetch)/iu.test(rawMessage) ||
    /^(?:23|42)[0-9A-Z]{3}$/u.test(rawCode);
  return {
    statusCode,
    code: unsafe ? "RAW_MATERIAL_DELIVERY_NOTE_OCR_FAILED" : rawCode,
    message: unsafe ? "送货单没有生成识别草稿，请刷新登录状态后直接重试。" : rawMessage || "原材料送货单 OCR 识别失败。",
    details: unsafe ? undefined : sanitizeOcrErrorDetails(error?.details),
    redacted: unsafe,
  };
}

function toRawMaterialOcrCommandError(error) {
  const safeError = toSafeRawMaterialOcrError(error);
  return {
    error: true,
    statusCode: safeError.statusCode,
    code: safeError.code,
    message: safeError.message,
    ...(safeError.details ? { details: safeError.details } : {}),
  };
}

async function recognizeDeliveryNotePageWithRetry({ page, sleep, tencentCloudTableOcrService }) {
  const maximumAttempts = 3;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await tencentCloudTableOcrService.recognizeTable({
        contentDataUrl: page.contentDataUrl,
        mimeType: page.mimeType,
        pdfPageNumber: page.pdfPageNumber,
        useNewModel: page.useNewModel === true,
      });
    } catch (error) {
      if (!isTencentOcrRateLimitError(error) || attempt === maximumAttempts) throw error;
      await sleep(700 * attempt);
    }
  }
  throw new Error("腾讯云 OCR 多页识别重试失败。");
}

function isTencentOcrRateLimitError(error) {
  return Number(error?.statusCode) === 429 ||
    /RequestLimitExceeded|LimitExceeded/i.test(cleanText(error?.details?.cloudCode));
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const purchaseStatusTransitions = Object.freeze({
  "待执行": Object.freeze(["已联系供应商", "已取消"]),
  "已联系供应商": Object.freeze(["已下单", "已取消"]),
  "已下单": Object.freeze(["部分到货", "已完成", "已取消"]),
  "部分到货": Object.freeze(["已完成", "已取消"]),
  "已完成": Object.freeze([]),
  "已取消": Object.freeze([]),
});

function normalizePurchaseMaterialLines(value) {
  if (!Array.isArray(value)) return [];
  return value.map((line, index) => ({
    lineNo: index + 1,
    materialName: cleanText(line?.materialName ?? line?.name),
    color: cleanText(line?.color),
    specification: cleanText(line?.specification ?? line?.spec),
    plannedQty: Number(line?.plannedQty ?? line?.quantity ?? line?.qty ?? 0),
    unit: cleanText(line?.unit || "kg"),
    remark: cleanText(line?.remark),
  })).filter((line) => line.materialName && Number.isFinite(line.plannedQty) && line.plannedQty > 0);
}

function normalizeOptionalTimestamp(value) {
  if (!cleanText(value)) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw Object.assign(new Error("采购到货要求时间无效。"), { statusCode: 422, code: "RAW_MATERIAL_PURCHASE_REQUIRED_AT_INVALID" });
  return new Date(timestamp).toISOString();
}

function requireExpectedRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) {
    throw Object.assign(new Error("expectedRevision 必须是当前记录的正整数版本号。"), { statusCode: 422, code: "EXPECTED_REVISION_REQUIRED" });
  }
  return revision;
}

function buildPurchaseIdempotencyPayload(body, purchaseRequest) {
  return {
    requestId: purchaseRequest.id,
    supplierId: purchaseRequest.supplierId,
    supplierNameSnapshot: purchaseRequest.supplierNameSnapshot,
    materialLines: purchaseRequest.materialLines,
    requiredAt: purchaseRequest.requiredAt,
    delegatedDecision: body.delegatedDecision ?? null,
    directDecisionContent: body.directDecisionContent ?? null,
  };
}

function buildPurchaseRequestId(idempotencyKey, workspace, nextId) {
  const key = cleanText(idempotencyKey);
  if (!key) return nextId("RMP", workspace.rawMaterialPurchaseRequests ?? []);
  return `RMP-${createHash("sha256").update(key).digest("hex").slice(0, 12).toUpperCase()}`;
}

function requirePurchaseDependencies(dependencies) {
  if (typeof dependencies.businessDecisionEvidenceService?.prepareDecision !== "function") {
    throw Object.assign(new Error("业务决定服务不可用。"), { statusCode: 503, code: "BUSINESS_DECISION_SERVICE_UNAVAILABLE" });
  }
  if (typeof dependencies.buildOperationLog !== "function" || typeof dependencies.nextId !== "function") {
    throw Object.assign(new Error("采购命令依赖不可用。"), { statusCode: 503, code: "RAW_MATERIAL_PURCHASE_SERVICE_UNAVAILABLE" });
  }
}

function purchaseValidation(code, message) {
  return purchaseError(422, code, message);
}

function purchaseError(statusCode, code, message, details) {
  return { error: true, statusCode, code, message, ...(details ? { details } : {}) };
}

function toPurchaseError(error, fallbackCode, fallbackMessage) {
  const statusCode = normalizeStatusCode(error?.statusCode);
  const details = error?.details ?? (error?.currentRevision ? { currentRevision: error.currentRevision } : undefined);
  return purchaseError(statusCode, cleanText(error?.code) || fallbackCode, cleanText(error?.message) || fallbackMessage, details);
}

function toIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

async function reparseStaleOcrDraft({
  documentDirectionHint,
  supplierNameHint,
  existingInbound,
  operatorId,
  rawMaterialOcrParserService,
  sourceDigest,
  workspace,
}) {
  const parserVersion = Number(rawMaterialOcrParserService?.parserVersion) || 1;
  const existingParserVersion = Number(existingInbound?.ocrParserVersion) || 1;
  const normalizedDirectionHint = normalizeDocumentDirectionHint(documentDirectionHint);
  const normalizedSupplierNameHint = cleanText(supplierNameHint);
  const directionChanged = normalizedDirectionHint && normalizedDirectionHint !== cleanText(existingInbound?.documentDirection);
  const supplierHintChanged = normalizedSupplierNameHint && normalizedSupplierNameHint !== cleanText(existingInbound?.supplierName);
  const canReparse =
    cleanText(existingInbound?.ocrProvider) === "tencent_cloud_table_v3" &&
    cleanText(existingInbound?.status) === "已识别待复核" &&
    (existingParserVersion < parserVersion || directionChanged || supplierHintChanged) &&
    Array.isArray(existingInbound?.ocrTableRows) &&
    existingInbound.ocrTableRows.length > 0;
  if (!canReparse) return { inbound: existingInbound, operationLogId: "" };

  const reparsedDraft = preserveReparsedOcrEvidence(rawMaterialOcrParserService.buildInboundDraft({
    colorAliases: workspace.colorAliases,
    documentDirectionHint: normalizedDirectionHint,
    inboundId: existingInbound.id,
    knownSupplierNames: collectKnownSupplierNames(workspace),
    ocr: {
      action: existingInbound.ocrAction,
      angle: existingInbound.ocrAngle,
      imageWidth: existingInbound.ocrImageWidth,
      imageHeight: existingInbound.ocrImageHeight,
      pageCount: existingInbound.ocrPageCount,
      pages: existingInbound.ocrPages,
      requestId: existingInbound.ocrRequestId,
      tables: rebuildOcrTables(
        existingInbound.ocrTableRows,
        existingInbound.ocrTableSourcePages,
        existingInbound.ocrPages,
      ),
    },
    recognizedAt: existingInbound.ocrRecognizedAt,
    standardColors: workspace.standardColors,
    supplierNameHint: normalizedSupplierNameHint,
  }), existingInbound);
  const saved = await workspace.rawMaterialInboundRepository.recordRawMaterialInboundAction({
    workspace,
    inboundId: existingInbound.id,
    action: "reparse_ocr",
    body: {
      expectedRevision: Number(existingInbound.revision ?? 1),
      reparsedInbound: reparsedDraft,
      reason: `使用已保存的 OCR 表格按解析器 V${parserVersion} 重新解析；未请求云端 OCR。`,
    },
    idempotencyKey: `raw-material-ocr-reparse:${sourceDigest}:v${parserVersion}:${normalizedDirectionHint || "infer"}:${normalizedSupplierNameHint || "ocr"}`,
    idempotencyPayload: {
      sourceDigest,
      parserVersion,
      documentDirectionHint: normalizedDirectionHint,
      supplierNameHint: normalizedSupplierNameHint,
    },
    operatorId,
    operatorName: getOperatorName(workspace, operatorId),
  });
  appendOperationLog(workspace, saved.operationLog);
  return {
    inbound: saved.inbound,
    operationLogId: saved.operationLogId ?? saved.operationLog?.id ?? "",
  };
}

function preserveReparsedOcrEvidence(reparsedDraft, existingInbound) {
  const existingLinesById = new Map((existingInbound?.ocrLines ?? []).map((line) => [cleanText(line?.lineId), line]));
  return {
    ...reparsedDraft,
    ocrImageWidth: Number(reparsedDraft?.ocrImageWidth) > 0
      ? reparsedDraft.ocrImageWidth
      : Number(existingInbound?.ocrImageWidth) || 0,
    ocrImageHeight: Number(reparsedDraft?.ocrImageHeight) > 0
      ? reparsedDraft.ocrImageHeight
      : Number(existingInbound?.ocrImageHeight) || 0,
    ocrLines: (reparsedDraft?.ocrLines ?? []).map((line) => {
      const existingLine = existingLinesById.get(cleanText(line?.lineId));
      if (!existingLine) return line;
      return {
        ...line,
        sourceBounds: line?.sourceBounds ?? existingLine.sourceBounds ?? null,
        sourceText: cleanText(line?.sourceText) || cleanText(existingLine.sourceText),
      };
    }),
  };
}

function rebuildOcrTables(tableRows = [], tableSourcePages = [], ocrPages = []) {
  return tableRows.map((rows, tableIndex) => ({
    sourcePageIndex: Math.max(0, Number(tableSourcePages[tableIndex]) || 0),
    imageWidth: Number(ocrPages[Math.max(0, Number(tableSourcePages[tableIndex]) || 0)]?.imageWidth) || 0,
    imageHeight: Number(ocrPages[Math.max(0, Number(tableSourcePages[tableIndex]) || 0)]?.imageHeight) || 0,
    cells: (Array.isArray(rows) ? rows : []).flatMap((row, rowIndex) =>
      (Array.isArray(row) ? row : []).map((value, colIndex) => ({
        rowTl: rowIndex,
        rowBr: rowIndex,
        colTl: colIndex,
        colBr: colIndex,
        text: cleanText(value),
        confidence: 100,
      })),
    ),
  }));
}

function normalizeDeliveryNotePages(body = {}) {
  const suppliedPages = Array.isArray(body.pages) && body.pages.length ? body.pages : [body];
  if (suppliedPages.length > 4) {
    throw Object.assign(new Error("同一张送货单最多支持 4 页，请分开核对超出的附件。"), {
      statusCode: 422,
      code: "RAW_MATERIAL_DELIVERY_NOTE_PAGE_LIMIT_EXCEEDED",
    });
  }
  return suppliedPages.map((input, sourcePageIndex) => {
    const contentDataUrl = cleanText(input?.contentDataUrl);
    const ocrAttachmentId = cleanText(input?.ocrAttachmentId || input?.sourceAttachmentId);
    if (!contentDataUrl && !ocrAttachmentId) {
      throw Object.assign(new Error(`送货单第 ${sourcePageIndex + 1} 页没有可识别内容。`), {
        statusCode: 422,
        code: "RAW_MATERIAL_DELIVERY_NOTE_PAGE_REQUIRED",
      });
    }
    return {
      fileName: cleanText(input.fileName),
      mimeType: cleanText(input.mimeType),
      fileSize: Number(input.fileSize) || undefined,
      contentDataUrl,
      sourceMimeType: cleanText(input.sourceMimeType || input.mimeType),
      sourceFileSize: Number(input.sourceFileSize || input.fileSize) || undefined,
      sourceContentDataUrl: cleanText(input.sourceContentDataUrl) || contentDataUrl,
      sourceAttachmentId: cleanText(input.sourceAttachmentId),
      ocrAttachmentId,
      sourceNormalizedForOcr: input.sourceNormalizedForOcr === true,
      pdfPageNumber: Number(input.pdfPageNumber) || undefined,
      useNewModel: input.useNewModel === true,
    };
  });
}

async function resolveDeliveryNoteOcrPage({ workspace, page, sourcePageIndex, operatorId }) {
  if (page.contentDataUrl) return page;
  const attachment = await workspace.attachmentRepository?.findAttachmentById?.({
    workspace,
    attachmentId: page.ocrAttachmentId,
  });
  const pageLabel = `送货单第 ${sourcePageIndex + 1} 页`;
  if (!isValidRawMaterialCaptureAttachment(attachment, operatorId)) {
    throw Object.assign(new Error(`${pageLabel}识别附件无效或不属于当前操作人，请重新上传。`), {
      statusCode: 422,
      code: "RAW_MATERIAL_DELIVERY_NOTE_OCR_ATTACHMENT_INVALID",
    });
  }
  const stored = await workspace.attachmentObjectStorage?.readObject?.({ attachment });
  if (!stored?.buffer?.length) {
    throw Object.assign(new Error(`${pageLabel}识别附件内容不存在，请重新上传。`), {
      statusCode: 422,
      code: "RAW_MATERIAL_DELIVERY_NOTE_OCR_ATTACHMENT_CONTENT_MISSING",
    });
  }
  return {
    ...page,
    contentDataUrl: toDataUrl(stored.buffer, stored.contentType || attachment.mimeType),
    mimeType: cleanText(stored.contentType || attachment.mimeType || page.mimeType),
    fileSize: stored.buffer.length,
  };
}

async function resolveDeliveryNoteSourceEvidence({ workspace, page, sourcePageIndex, operatorId }) {
  if (!page.sourceAttachmentId) {
    return {
      attachment: null,
      contentDigest: createHash("sha256").update(page.sourceContentDataUrl).digest("hex"),
    };
  }
  const attachment = await workspace.attachmentRepository?.findAttachmentById?.({
    workspace,
    attachmentId: page.sourceAttachmentId,
  });
  const pageLabel = `送货单第 ${sourcePageIndex + 1} 页`;
  if (!attachment) {
    throw Object.assign(new Error(`${pageLabel}原图附件不存在，请重新上传。`), {
      statusCode: 422,
      code: "RAW_MATERIAL_DELIVERY_NOTE_SOURCE_ATTACHMENT_NOT_FOUND",
    });
  }
  if (!isValidRawMaterialCaptureAttachment(attachment, operatorId) || !cleanText(attachment.contentDigest)) {
    throw Object.assign(new Error(`${pageLabel}原图附件无效或不属于当前操作人，请重新上传。`), {
      statusCode: 422,
      code: "RAW_MATERIAL_DELIVERY_NOTE_SOURCE_ATTACHMENT_INVALID",
    });
  }
  return { attachment, contentDigest: cleanText(attachment.contentDigest) };
}

function isValidRawMaterialCaptureAttachment(attachment, operatorId) {
  return Boolean(
    attachment &&
    attachment.ownerType === "raw_material_inbound_capture" &&
    attachment.purpose === "raw_material_delivery_note" &&
    attachment.status === "uploaded" &&
    cleanText(attachment.uploadedBy) === cleanText(operatorId) &&
    attachment.hasContent === true
  );
}

function toDataUrl(buffer, mimeType = "application/octet-stream") {
  return `data:${cleanText(mimeType) || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
}

function normalizeOcrPageResult(ocr = {}, sourcePageIndex = 0) {
  const imageWidth = Number(ocr.imageWidth) || 0;
  const imageHeight = Number(ocr.imageHeight) || 0;
  return {
    ...ocr,
    sourcePageIndex,
    pageNumber: sourcePageIndex + 1,
    tables: (Array.isArray(ocr.tables) ? ocr.tables : []).map((table) => ({
      ...table,
      sourcePageIndex,
      imageWidth: Number(table?.imageWidth) || imageWidth,
      imageHeight: Number(table?.imageHeight) || imageHeight,
    })),
  };
}

function combineOcrPageResults(pages = []) {
  const first = pages[0] ?? {};
  return {
    action: cleanText(first.action),
    provider: cleanText(first.provider),
    requestId: pages.map((page) => cleanText(page.requestId)).filter(Boolean).join(","),
    angle: Number(first.angle) || 0,
    imageWidth: Number(first.imageWidth) || 0,
    imageHeight: Number(first.imageHeight) || 0,
    pageCount: pages.length,
    pages: pages.map((page, sourcePageIndex) => ({
      sourcePageIndex,
      pageNumber: sourcePageIndex + 1,
      angle: Number(page.angle) || 0,
      imageWidth: Number(page.imageWidth) || 0,
      imageHeight: Number(page.imageHeight) || 0,
      requestId: cleanText(page.requestId),
    })),
    tables: pages.flatMap((page) => page.tables ?? []),
  };
}

function normalizeTextArray(values, fallback = "") {
  const normalized = (Array.isArray(values) ? values : []).map(cleanText).filter(Boolean);
  if (normalized.length) return normalized;
  const fallbackValue = cleanText(fallback);
  return fallbackValue ? [fallbackValue] : [];
}

function requireOcrDependencies(dependencies) {
  const required = {
    attachmentCreateCommandService: dependencies.attachmentCreateCommandService?.createAttachment,
    buildOperationLog: dependencies.buildOperationLog,
    nextId: dependencies.nextId,
    rawMaterialOcrParserService: dependencies.rawMaterialOcrParserService?.buildInboundDraft,
    tencentCloudTableOcrService: dependencies.tencentCloudTableOcrService?.recognizeTable,
  };
  for (const [name, dependency] of Object.entries(required)) {
    if (typeof dependency !== "function") {
      throw Object.assign(new Error(`Raw-material OCR dependency is unavailable: ${name}`), {
        statusCode: 503,
        code: "RAW_MATERIAL_OCR_SERVICE_UNAVAILABLE",
      });
    }
  }
}

function collectKnownSupplierNames(workspace = {}) {
  return [
    ...(workspace.suppliers ?? []).map((supplier) => supplier?.name ?? supplier?.supplierName),
    ...(workspace.rawMaterialInbounds ?? []).map((inbound) => inbound?.supplierName),
  ].map(cleanText).filter(Boolean);
}

function inferSourceFileType(mimeType, fileName) {
  const mime = cleanText(mimeType).toLowerCase();
  const name = cleanText(fileName).toLowerCase();
  return mime === "application/pdf" || name.endsWith(".pdf") ? "pdf" : "image";
}

function sanitizeOcrErrorDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const safeDetails = {
    cloudCode: cleanText(details.cloudCode),
    requestId: cleanText(details.requestId),
  };
  return Object.values(safeDetails).some(Boolean) ? safeDetails : undefined;
}

function buildRawMaterialDeliveryNoteDuplicateKey(draft = {}) {
  const supplierName = normalizeRawMaterialDuplicateText(draft.supplierName);
  const deliveryNoteNo = normalizeRawMaterialDuplicateText(draft.deliveryNoteNo);
  if (!supplierName || !deliveryNoteNo) return "";
  return `${supplierName}::${deliveryNoteNo}`;
}

function findRawMaterialDeliveryNoteDuplicates(inbounds = [], draft = {}) {
  const duplicateKey = buildRawMaterialDeliveryNoteDuplicateKey(draft);
  if (!duplicateKey) return [];
  return (Array.isArray(inbounds) ? inbounds : []).filter((item) => {
    if (cleanText(item?.status) === "已作废") return false;
    return (cleanText(item?.documentDuplicateKey) || buildRawMaterialDeliveryNoteDuplicateKey(item)) === duplicateKey;
  });
}

function validateRawMaterialDeliveryNoteDuplicateConfirmation({
  body = {},
  documentDuplicateKey = "",
  duplicateCandidates = [],
  sourceDigest = "",
} = {}) {
  if (!duplicateCandidates.length) return { confirmed: false };
  const expectedToken = buildRawMaterialDeliveryNoteDuplicateConfirmationToken({
    documentDuplicateKey,
    duplicateCandidates,
    sourceDigest,
  });
  const submittedToken = cleanText(body.duplicateConfirmationToken);
  return { confirmed: Boolean(submittedToken && submittedToken === expectedToken) };
}

function buildRawMaterialDeliveryNoteDuplicateConfirmationToken({
  documentDuplicateKey = "",
  duplicateCandidates = [],
  sourceDigest = "",
} = {}) {
  const duplicateIds = duplicateCandidates.map((item) => cleanText(item?.id)).filter(Boolean).sort();
  return createHash("sha256")
    .update(`raw-material-delivery-note-duplicate-v1\n${documentDuplicateKey}\n${sourceDigest}\n${duplicateIds.join("\n")}`)
    .digest("hex");
}

function normalizeRawMaterialDuplicateText(value) {
  return cleanText(value).normalize("NFKC").replace(/[\s\-—_]+/gu, "").toLocaleLowerCase("zh-CN");
}

function appendOperationLog(workspace, operationLog) {
  if (!operationLog || typeof operationLog !== "object") return;
  const rows = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
  const operationLogId = cleanText(operationLog.id);
  workspace.operationLogs = [
    operationLog,
    ...rows.filter((row) => !operationLogId || cleanText(row?.id) !== operationLogId),
  ];
}

function getOperationLogId(result = {}) {
  return result.operationLogId ?? result.operationLog?.id ?? "";
}

function getOperatorName(workspace, operatorId) {
  const normalizedOperatorId = cleanText(operatorId);
  const user = (Array.isArray(workspace.users) ? workspace.users : []).find(
    (item) => cleanText(item?.id ?? item?.userId) === normalizedOperatorId,
  );
  return cleanText(user?.displayName ?? user?.display_name ?? user?.name) || normalizedOperatorId;
}

function normalizeStatusCode(value) {
  const statusCode = Number(value);
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
}

function normalizeDocumentDirectionHint(value) {
  const direction = cleanText(value);
  return ["supplier_delivery", "supplier_return"].includes(direction) ? direction : "";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

import { useEffect, useRef, useState } from "react";
import {
  v1BoundaryStageStatusOptions,
  v1SignoffStageStatusOptions,
} from "./v1StatusPresentation.js";

export function useV1StatusFieldEvidenceController({
  fieldEvidenceProgress,
  fieldEvidenceStageRowAction,
  fieldEvidenceAttachmentAction,
  fieldEvidenceAttachmentListAction,
  signoffBoundaryAttachmentAction,
  signoffBoundaryAttachmentListAction,
  v1V2BoundaryPrecheckAction,
  canReviewFieldEvidenceAfterStage,
  onStageFieldEvidenceRow,
  onUploadFieldEvidenceAttachment,
  onListFieldEvidenceAttachments,
  onUploadSignoffBoundaryAttachment,
  onListSignoffBoundaryAttachments,
  onValidateFieldEvidenceDraft,
  onPrecheckReleaseCandidateRefresh,
  onPrecheckV1V2Boundary,
  selectWorkspace,
}) {
  const [activeStage, setActiveStage] = useState("progress");
  const [evidenceStageDraft, setEvidenceStageDraft] = useState({
    selectionKey: "",
    onsiteStatus: "passed",
    onsiteEvidenceRef: "",
    onsiteNotes: "",
  });
  const [evidenceAttachmentFile, setEvidenceAttachmentFile] = useState(null);
  const [signoffBoundaryAttachmentFile, setSignoffBoundaryAttachmentFile] = useState(null);
  const [showAllMissingEvidenceItems, setShowAllMissingEvidenceItems] = useState(false);
  const [selectedMissingEvidenceGroupKey, setSelectedMissingEvidenceGroupKey] = useState("");
  const [signoffStageDraft, setSignoffStageDraft] = useState({
    selectionKey: "",
    onsiteStatus: "signed",
    person: "",
    time: "",
    onsiteNotes: "",
  });
  const evidenceStageCardRef = useRef(null);
  const evidenceStageRefInputRef = useRef(null);
  const signoffStageCardRef = useRef(null);
  const signoffStagePersonInputRef = useRef(null);
  const fieldEvidenceIntakeQualityRef = useRef(null);
  const fieldEvidenceProgressRef = useRef(null);

  const missingEvidenceOptions = fieldEvidenceProgress?.missingItems || [];
  const fieldEvidenceGroupSummaries = fieldEvidenceProgress?.groupSummaries?.length
    ? fieldEvidenceProgress.groupSummaries
    : buildFieldEvidenceGroupSummaries(fieldEvidenceProgress?.groups || [], missingEvidenceOptions);
  const selectedMissingEvidenceGroup =
    fieldEvidenceGroupSummaries.find((group) => group.key === selectedMissingEvidenceGroupKey) || null;
  const scopedMissingEvidenceOptions = selectedMissingEvidenceGroup
    ? missingEvidenceOptions.filter((item) => item.groupKey === selectedMissingEvidenceGroup.key)
    : missingEvidenceOptions;
  const visibleMissingEvidenceItems = showAllMissingEvidenceItems
    ? scopedMissingEvidenceOptions
    : scopedMissingEvidenceOptions.slice(0, 6);
  const missingEvidenceTotalCount = selectedMissingEvidenceGroup
    ? scopedMissingEvidenceOptions.length
    : fieldEvidenceProgress?.summary?.missingEvidenceItemCount || missingEvidenceOptions.length;
  const missingEvidenceDisplayCountLabel = `${visibleMissingEvidenceItems.length}/${missingEvidenceTotalCount}`;
  const missingEvidenceDisplayLabel = selectedMissingEvidenceGroup
    ? `${selectedMissingEvidenceGroup.label} ${missingEvidenceDisplayCountLabel}`
    : missingEvidenceDisplayCountLabel;
  const canToggleMissingEvidenceItems = scopedMissingEvidenceOptions.length > 6;
  const signoffBoundaryOptions = fieldEvidenceProgress?.signoffBoundaryActions || [];
  const selectedEvidenceStageItem =
    missingEvidenceOptions.find((item) => `${item.groupKey}:${item.key}` === evidenceStageDraft.selectionKey) ||
    missingEvidenceOptions[0] ||
    null;
  const selectedEvidenceAttachmentOwnerId = selectedEvidenceStageItem
    ? `${selectedEvidenceStageItem.groupKey || "field_evidence"}:${selectedEvidenceStageItem.key || "evidence_item"}`
    : "";
  const selectedEvidenceAttachmentListResult =
    fieldEvidenceAttachmentListAction.result?.ownerId === selectedEvidenceAttachmentOwnerId
      ? fieldEvidenceAttachmentListAction.result
      : null;
  const selectedEvidenceAttachmentListError =
    fieldEvidenceAttachmentListAction.ownerId === selectedEvidenceAttachmentOwnerId
      ? fieldEvidenceAttachmentListAction.error
      : "";
  const selectedSignoffBoundaryStageItem =
    signoffBoundaryOptions.find((item) => `${item.type}:${item.key}` === signoffStageDraft.selectionKey) ||
    signoffBoundaryOptions[0] ||
    null;
  const selectedSignoffBoundaryAttachmentOwnerId = selectedSignoffBoundaryStageItem
    ? `${selectedSignoffBoundaryStageItem.type || "signoff"}:${selectedSignoffBoundaryStageItem.key || "owner"}`
    : "";
  const selectedSignoffBoundaryAttachmentListResult =
    signoffBoundaryAttachmentListAction.result?.ownerId === selectedSignoffBoundaryAttachmentOwnerId
      ? signoffBoundaryAttachmentListAction.result
      : null;
  const selectedSignoffBoundaryAttachmentListError =
    signoffBoundaryAttachmentListAction.ownerId === selectedSignoffBoundaryAttachmentOwnerId
      ? signoffBoundaryAttachmentListAction.error
      : "";
  const selectedSignoffStatusOptions =
    selectedSignoffBoundaryStageItem?.type === "boundary"
      ? v1BoundaryStageStatusOptions
      : v1SignoffStageStatusOptions;
  const evidenceStageRequiresRef = ["passed", "accepted"].includes(evidenceStageDraft.onsiteStatus);
  const signoffStageRequiresPersonTime =
    selectedSignoffBoundaryStageItem?.type === "boundary"
      ? signoffStageDraft.onsiteStatus === "confirmed"
      : ["signed", "accepted"].includes(signoffStageDraft.onsiteStatus);
  const canStageEvidenceRow =
    Boolean(onStageFieldEvidenceRow) &&
    Boolean(selectedEvidenceStageItem) &&
    !fieldEvidenceStageRowAction.loading &&
    !fieldEvidenceAttachmentAction.loading &&
    (!evidenceStageRequiresRef || evidenceStageDraft.onsiteEvidenceRef.trim());
  const canStageEvidenceRowAndReview = canStageEvidenceRow && canReviewFieldEvidenceAfterStage;
  const canUploadAndStageEvidenceAttachment =
    Boolean(onUploadFieldEvidenceAttachment) &&
    Boolean(onStageFieldEvidenceRow) &&
    Boolean(selectedEvidenceStageItem) &&
    Boolean(evidenceAttachmentFile) &&
    !fieldEvidenceAttachmentAction.loading &&
    !fieldEvidenceAttachmentListAction.loading &&
    !fieldEvidenceStageRowAction.loading;
  const canListEvidenceAttachments =
    Boolean(onListFieldEvidenceAttachments) &&
    Boolean(selectedEvidenceStageItem) &&
    !fieldEvidenceAttachmentAction.loading &&
    !fieldEvidenceAttachmentListAction.loading &&
    !fieldEvidenceStageRowAction.loading;
  const canStageSignoffBoundaryRow =
    Boolean(onStageFieldEvidenceRow) &&
    Boolean(selectedSignoffBoundaryStageItem) &&
    !fieldEvidenceStageRowAction.loading &&
    !signoffBoundaryAttachmentAction.loading &&
    !signoffBoundaryAttachmentListAction.loading &&
    (!signoffStageRequiresPersonTime || (signoffStageDraft.person.trim() && signoffStageDraft.time.trim()));
  const canStageSignoffBoundaryRowAndReview = canStageSignoffBoundaryRow && canReviewFieldEvidenceAfterStage;
  const canStageBoundaryRowAndPrecheck =
    canStageSignoffBoundaryRow &&
    selectedSignoffBoundaryStageItem?.type === "boundary" &&
    Boolean(onPrecheckV1V2Boundary) &&
    !v1V2BoundaryPrecheckAction.loading;
  const canUploadSignoffBoundaryAttachment =
    Boolean(onUploadSignoffBoundaryAttachment) &&
    Boolean(selectedSignoffBoundaryStageItem) &&
    Boolean(signoffBoundaryAttachmentFile) &&
    !fieldEvidenceStageRowAction.loading &&
    !signoffBoundaryAttachmentAction.loading &&
    !signoffBoundaryAttachmentListAction.loading;
  const canListSignoffBoundaryAttachments =
    Boolean(onListSignoffBoundaryAttachments) &&
    Boolean(selectedSignoffBoundaryStageItem) &&
    !fieldEvidenceStageRowAction.loading &&
    !signoffBoundaryAttachmentAction.loading &&
    !signoffBoundaryAttachmentListAction.loading;

  useEffect(() => {
    if (!missingEvidenceOptions.length) return;
    const stillExists = missingEvidenceOptions.some((item) => `${item.groupKey}:${item.key}` === evidenceStageDraft.selectionKey);
    if (!stillExists) {
      const first = missingEvidenceOptions[0];
      setEvidenceStageDraft((current) => ({ ...current, selectionKey: `${first.groupKey}:${first.key}` }));
    }
  }, [missingEvidenceOptions, evidenceStageDraft.selectionKey]);

  useEffect(() => {
    if (!selectedMissingEvidenceGroupKey) return;
    if (!fieldEvidenceGroupSummaries.some((group) => group.key === selectedMissingEvidenceGroupKey)) {
      setSelectedMissingEvidenceGroupKey("");
    }
  }, [fieldEvidenceGroupSummaries, selectedMissingEvidenceGroupKey]);

  useEffect(() => {
    if (!signoffBoundaryOptions.length) return;
    const stillExists = signoffBoundaryOptions.some((item) => `${item.type}:${item.key}` === signoffStageDraft.selectionKey);
    if (!stillExists) {
      const first = signoffBoundaryOptions[0];
      setSignoffStageDraft((current) => ({
        ...current,
        selectionKey: `${first.type}:${first.key}`,
        onsiteStatus: first.type === "boundary" ? "confirmed" : "signed",
      }));
    }
  }, [signoffBoundaryOptions, signoffStageDraft.selectionKey]);

  function stageSelectedEvidenceRow() {
    if (!canStageEvidenceRow || !selectedEvidenceStageItem) return;
    onStageFieldEvidenceRow(buildEvidenceStageRow());
  }

  async function stageSelectedEvidenceRowAndReview() {
    if (!canStageEvidenceRowAndReview || !selectedEvidenceStageItem) return;
    const result = await onStageFieldEvidenceRow(buildEvidenceStageRow());
    if (!result?.stageResult || result?.blocked) return;
    await onValidateFieldEvidenceDraft();
    await onPrecheckReleaseCandidateRefresh();
  }

  async function uploadAndStageSelectedEvidenceAttachment() {
    if (!canUploadAndStageEvidenceAttachment || !selectedEvidenceStageItem) return;
    const uploadResult = await onUploadFieldEvidenceAttachment({
      evidenceItem: selectedEvidenceStageItem,
      file: evidenceAttachmentFile,
      remark: evidenceStageDraft.onsiteNotes,
    });
    const attachmentId = uploadResult?.attachment?.attachmentId || "";
    if (!attachmentId || uploadResult?.blocked) return;
    setEvidenceStageDraft((current) => ({
      ...current,
      onsiteEvidenceRef: attachmentId,
      onsiteNotes: current.onsiteNotes || uploadResult.attachment.fileName || "",
    }));
    await onStageFieldEvidenceRow({
      ...buildEvidenceStageRow(),
      onsiteEvidenceRef: attachmentId,
      onsiteNotes: evidenceStageDraft.onsiteNotes || uploadResult.attachment.fileName || "",
    });
  }

  async function listSelectedEvidenceAttachments() {
    if (!canListEvidenceAttachments || !selectedEvidenceStageItem) return;
    await onListFieldEvidenceAttachments({ evidenceItem: selectedEvidenceStageItem });
  }

  function selectMissingEvidenceForStage(item) {
    if (!item?.groupKey || !item?.key) return;
    selectWorkspace("field", "evidence");
    setActiveStage("evidence");
    setEvidenceStageDraft((current) => ({
      ...current,
      selectionKey: `${item.groupKey}:${item.key}`,
      onsiteStatus: current.onsiteStatus || "passed",
      onsiteEvidenceRef: "",
      onsiteNotes: "",
    }));
    setEvidenceAttachmentFile(null);
    focusOnNextFrame(evidenceStageCardRef, evidenceStageRefInputRef);
  }

  function selectSignoffBoundaryForStage(item) {
    if (!item?.type || !item?.key) return;
    selectWorkspace("field", "evidence");
    setActiveStage("signoff");
    setSignoffStageDraft({
      selectionKey: `${item.type}:${item.key}`,
      onsiteStatus: item.type === "boundary" ? "confirmed" : "signed",
      person: "",
      time: "",
      onsiteNotes: "",
    });
    setSignoffBoundaryAttachmentFile(null);
    focusOnNextFrame(signoffStageCardRef, signoffStagePersonInputRef);
  }

  function fillEvidenceRefFromAttachment(attachment) {
    const attachmentId = attachment?.attachmentId || "";
    if (!/^ATT-/.test(attachmentId)) return;
    setEvidenceStageDraft((current) => ({
      ...current,
      onsiteEvidenceRef: attachmentId,
      onsiteNotes: current.onsiteNotes || attachment.fileName || "",
    }));
  }

  async function uploadAndFillSelectedSignoffBoundaryAttachment() {
    if (!canUploadSignoffBoundaryAttachment || !selectedSignoffBoundaryStageItem) return;
    const uploadResult = await onUploadSignoffBoundaryAttachment({
      signoffItem: selectedSignoffBoundaryStageItem,
      file: signoffBoundaryAttachmentFile,
      remark: signoffStageDraft.onsiteNotes,
    });
    if (!uploadResult?.attachment?.attachmentId || uploadResult?.blocked) return;
    fillSignoffBoundaryNoteFromAttachment(uploadResult.attachment);
  }

  async function listSelectedSignoffBoundaryAttachments() {
    if (!canListSignoffBoundaryAttachments || !selectedSignoffBoundaryStageItem) return;
    await onListSignoffBoundaryAttachments({ signoffItem: selectedSignoffBoundaryStageItem });
  }

  function fillSignoffBoundaryNoteFromAttachment(attachment) {
    const attachmentId = attachment?.attachmentId || "";
    if (!/^ATT-/.test(attachmentId)) return;
    const attachmentNote = `附件:${attachmentId} ${attachment.fileName || "签字附件"}`;
    setSignoffStageDraft((current) => ({
      ...current,
      onsiteNotes: current.onsiteNotes.includes(attachmentId)
        ? current.onsiteNotes
        : current.onsiteNotes
          ? `${current.onsiteNotes}；${attachmentNote}`
          : attachmentNote,
    }));
  }

  function buildSelectedSignoffBoundaryStageRow() {
    if (!selectedSignoffBoundaryStageItem) return null;
    const isBoundary = selectedSignoffBoundaryStageItem.type === "boundary";
    return {
      rowType: selectedSignoffBoundaryStageItem.type,
      role: selectedSignoffBoundaryStageItem.key,
      onsiteStatus: signoffStageDraft.onsiteStatus,
      onsiteSigner: isBoundary ? "" : signoffStageDraft.person,
      onsiteSignedAt: isBoundary ? "" : signoffStageDraft.time,
      onsiteConfirmedBy: isBoundary ? signoffStageDraft.person : "",
      onsiteConfirmedAt: isBoundary ? signoffStageDraft.time : "",
      onsiteNotes: signoffStageDraft.onsiteNotes,
    };
  }

  function stageSelectedSignoffBoundaryRow() {
    if (!canStageSignoffBoundaryRow) return;
    const row = buildSelectedSignoffBoundaryStageRow();
    if (row) onStageFieldEvidenceRow(row);
  }

  async function stageSelectedSignoffBoundaryRowAndReview() {
    if (!canStageSignoffBoundaryRowAndReview) return;
    const row = buildSelectedSignoffBoundaryStageRow();
    if (!row) return;
    const result = await onStageFieldEvidenceRow(row);
    if (!result?.stageResult || result?.blocked) return;
    await onValidateFieldEvidenceDraft();
    await onPrecheckReleaseCandidateRefresh();
  }

  async function stageSelectedBoundaryRowAndPrecheck() {
    if (!canStageBoundaryRowAndPrecheck || selectedSignoffBoundaryStageItem?.type !== "boundary") return;
    const row = buildSelectedSignoffBoundaryStageRow();
    if (!row) return;
    const result = await onStageFieldEvidenceRow(row);
    if (!result?.stageResult || result?.blocked) return;
    await onPrecheckV1V2Boundary();
  }

  function buildEvidenceStageRow() {
    return {
      rowType: "evidence",
      groupKey: selectedEvidenceStageItem.groupKey,
      itemKey: selectedEvidenceStageItem.key,
      onsiteStatus: evidenceStageDraft.onsiteStatus,
      onsiteEvidenceRef: evidenceStageDraft.onsiteEvidenceRef,
      onsiteNotes: evidenceStageDraft.onsiteNotes,
    };
  }

  return {
    activeStage,
    setActiveStage,
    evidenceStageDraft,
    setEvidenceStageDraft,
    setEvidenceAttachmentFile,
    signoffStageDraft,
    setSignoffStageDraft,
    setSignoffBoundaryAttachmentFile,
    showAllMissingEvidenceItems,
    setShowAllMissingEvidenceItems,
    selectedMissingEvidenceGroupKey,
    setSelectedMissingEvidenceGroupKey,
    missingEvidenceOptions,
    fieldEvidenceGroupSummaries,
    selectedMissingEvidenceGroup,
    visibleMissingEvidenceItems,
    missingEvidenceDisplayLabel,
    canToggleMissingEvidenceItems,
    signoffBoundaryOptions,
    selectedEvidenceStageItem,
    selectedEvidenceAttachmentListResult,
    selectedEvidenceAttachmentListError,
    selectedSignoffBoundaryStageItem,
    selectedSignoffBoundaryAttachmentListResult,
    selectedSignoffBoundaryAttachmentListError,
    selectedSignoffStatusOptions,
    canStageEvidenceRow,
    canStageEvidenceRowAndReview,
    canUploadAndStageEvidenceAttachment,
    canListEvidenceAttachments,
    canStageSignoffBoundaryRow,
    canStageSignoffBoundaryRowAndReview,
    canStageBoundaryRowAndPrecheck,
    canUploadSignoffBoundaryAttachment,
    canListSignoffBoundaryAttachments,
    evidenceStageCardRef,
    evidenceStageRefInputRef,
    signoffStageCardRef,
    signoffStagePersonInputRef,
    fieldEvidenceIntakeQualityRef,
    fieldEvidenceProgressRef,
    stageSelectedEvidenceRow,
    stageSelectedEvidenceRowAndReview,
    uploadAndStageSelectedEvidenceAttachment,
    listSelectedEvidenceAttachments,
    selectMissingEvidenceForStage,
    selectSignoffBoundaryForStage,
    fillEvidenceRefFromAttachment,
    uploadAndFillSelectedSignoffBoundaryAttachment,
    listSelectedSignoffBoundaryAttachments,
    fillSignoffBoundaryNoteFromAttachment,
    stageSelectedSignoffBoundaryRow,
    stageSelectedSignoffBoundaryRowAndReview,
    stageSelectedBoundaryRowAndPrecheck,
  };
}

function buildFieldEvidenceGroupSummaries(groups = [], missingItems = []) {
  const missingByGroup = new Map();
  missingItems.forEach((item) => {
    const groupKey = item.groupKey || "ungrouped";
    if (!missingByGroup.has(groupKey)) missingByGroup.set(groupKey, []);
    missingByGroup.get(groupKey).push(item);
  });
  return groups.map((group) => {
    const groupMissingItems = missingByGroup.get(group.key) || [];
    const missingCount = groupMissingItems.length || group.blockedRequired || 0;
    return {
      ...group,
      missingItems: groupMissingItems,
      missingCount,
      missingLabel: group.requiredTotal > 0 ? `${missingCount}/${group.requiredTotal}` : `${missingCount}`,
      firstMissingItem: groupMissingItems[0] || null,
      firstMissingItems: groupMissingItems.slice(0, 3),
      previewItems: groupMissingItems.slice(0, 3),
      hiddenPreviewCount: Math.max(0, groupMissingItems.length - 3),
    };
  }).filter((group) => group.key);
}

function focusOnNextFrame(cardRef, inputRef) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    inputRef.current?.focus();
  });
}

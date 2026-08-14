import {
  getBusinessTypeTagValue,
  getOperationalStateTagValue,
  getRequirementTagValue,
} from "../../../../../src/shared/labels.js";
import { SemanticTag as SharedSemanticTag } from "../../../../../src/shared/ui/operational.jsx";

const tagValueResolvers = Object.freeze({
  business: getBusinessTypeTagValue,
  requirement: getRequirementTagValue,
  state: (value) => (
    value === "印刷中" ? "running" : getOperationalStateTagValue(value)
  ),
});

export function SemanticTag({ kind, value, size = "compact", className = "" }) {
  const normalizedKind = tagValueResolvers[kind] ? kind : "state";
  const normalizedLabel = String(value ?? "").trim();
  const resolvedValue = tagValueResolvers[normalizedKind](normalizedLabel);

  return (
    <SharedSemanticTag
      className={className}
      kind={normalizedKind}
      label={normalizedLabel || undefined}
      size={size}
      value={resolvedValue}
    />
  );
}

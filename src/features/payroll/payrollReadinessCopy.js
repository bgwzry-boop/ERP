function criterion(workbench, key) {
  const criteria = workbench?.formalReadiness?.criteria;
  if (!Array.isArray(criteria)) return null;
  return criteria.find((item) => item?.key === key) || null;
}

export function payrollReadinessFacts(workbench) {
  const source = criterion(workbench, "attendance_source");
  const policy = criterion(workbench, "payroll_policy");
  const synced = criterion(workbench, "attendance_import");
  const sourceConfigured = source
    ? source.status === "passed"
    : workbench?.sourceStatus?.configured === true;
  const policyPublished = policy?.evidence && Object.hasOwn(policy.evidence, "published")
    ? policy.evidence.published === true
    : Boolean(workbench?.policyVersion);
  const attendanceSynced = synced
    ? synced.status === "passed"
    : workbench?.summary?.attendanceCoverageComplete === true;
  return { sourceConfigured, policyPublished, attendanceSynced };
}

export function payrollReadinessStatusSentence(workbench) {
  const facts = payrollReadinessFacts(workbench);
  return [
    facts.sourceConfigured ? "来源已配置" : "真实考勤来源未配置",
    facts.policyPublished ? "费率规则已发布" : "本月计薪规则未发布",
    facts.attendanceSynced ? "考勤已整月同步" : "考勤尚未整月同步",
  ].join("，");
}

const RESTATED_FACT_LABELS = new Set([
  "真实考勤来源未配置",
  "真实考勤来源已配置",
  "来源已配置",
  "本月计薪规则未发布",
  "本月岗位费率规则已发布",
  "本月岗位费率规则已发布且覆盖全部计薪岗位",
  "费率规则已发布",
  "本月自然月考勤已整月同步且无未匹配身份",
  "本月自然月考勤尚未整月同步",
  "计薪月份尚未结束，考勤尚未整月同步",
  "考勤已整月同步",
  "考勤尚未整月同步",
]);

export function payrollReadinessBlockerLabels(workbench) {
  const blockers = workbench?.formalReadiness?.blockingCriteria;
  if (!Array.isArray(blockers)) return [];
  const seen = new Set();
  const labels = [];
  for (const item of blockers) {
    const label = String(item?.label || "").trim();
    if (!label || seen.has(label) || RESTATED_FACT_LABELS.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function positionRatePublished(position, workbench) {
  if (!position?.key || !workbench?.policyVersion) return false;
  const keys = workbench.policyVersion.positionRateKeys;
  if (!Array.isArray(keys)) return true;
  return keys.includes(position.key);
}

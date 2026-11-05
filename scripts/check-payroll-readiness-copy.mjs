import assert from "node:assert/strict";
import {
  payrollReadinessBlockerLabels,
  payrollReadinessFacts,
  payrollReadinessStatusSentence,
  positionRatePublished,
} from "../src/features/payroll/payrollReadinessCopy.js";

const published = {
  sourceStatus: { configured: true, label: "真实考勤来源已配置" },
  policyVersion: { versionLabel: "2026年8月", positionRateKeys: ["PAY-BAG", "PAY-DRIVER"] },
  summary: { attendanceCoverageComplete: true, draftReady: false },
  formalReadiness: {
    ready: false,
    criteria: [
      { key: "attendance_source", status: "passed", label: "真实考勤来源已配置", evidence: { configured: true } },
      { key: "payroll_policy", status: "passed", label: "本月岗位费率规则已发布", evidence: { published: true } },
      { key: "attendance_import", status: "passed", label: "本月自然月考勤已整月同步且无未匹配身份" },
      { key: "employee_profiles", status: "pending", label: "本月没有可计薪员工" },
      { key: "payroll_positions", status: "pending", label: "本月没有可计薪员工" },
    ],
    blockingCriteria: [
      { key: "employee_profiles", label: "本月没有可计薪员工" },
      { key: "payroll_positions", label: "本月没有可计薪员工" },
      { key: "attendance_source", label: "真实考勤来源已配置" },
    ],
  },
};

assert.deepEqual(payrollReadinessFacts(published), {
  sourceConfigured: true,
  policyPublished: true,
  attendanceSynced: true,
});
assert.equal(payrollReadinessStatusSentence(published), "来源已配置，费率规则已发布，考勤已整月同步");
assert.deepEqual(payrollReadinessBlockerLabels(published), ["本月没有可计薪员工"]);
assert.equal(positionRatePublished({ key: "PAY-BAG" }, published), true);
assert.equal(positionRatePublished({ key: "PAY-MISSING" }, published), false);

const unpublished = {
  sourceStatus: { configured: false, label: "真实考勤来源未配置" },
  policyVersion: null,
  summary: { attendanceCoverageComplete: false },
  formalReadiness: {
    ready: false,
    criteria: [
      { key: "attendance_source", status: "pending", label: "真实考勤来源未配置", evidence: { configured: false } },
      { key: "payroll_policy", status: "pending", label: "本月计薪规则未发布", evidence: { published: false } },
      { key: "attendance_import", status: "pending", label: "本月自然月考勤尚未整月同步" },
    ],
    blockingCriteria: [
      { key: "attendance_source", label: "真实考勤来源未配置" },
      { key: "payroll_policy", label: "本月计薪规则未发布" },
      { key: "attendance_import", label: "本月自然月考勤尚未整月同步" },
    ],
  },
};
assert.equal(payrollReadinessStatusSentence(unpublished), "真实考勤来源未配置，本月计薪规则未发布，考勤尚未整月同步");
assert.deepEqual(payrollReadinessBlockerLabels(unpublished), []);
assert.equal(positionRatePublished({ key: "PAY-BAG" }, unpublished), false);
assert.equal(payrollReadinessStatusSentence(unpublished).includes("来源已配置"), false);
assert.equal(payrollReadinessStatusSentence(published).includes("未配置"), false);
assert.equal(payrollReadinessStatusSentence(published).includes("未发布"), false);

console.log("Payroll readiness copy uses one configured/published/synced sentence.");

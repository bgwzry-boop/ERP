import { createHash, randomUUID } from "node:crypto";
import { validateBusinessAttachment } from "./businessAttachmentValidationService.mjs";

const payrollRunTransitions = Object.freeze({
  draft: new Set(["reviewed"]),
  reviewed: new Set(["locked"]),
  locked: new Set(["paid"]),
  paid: new Set(),
});

export function createAttendancePayrollService(dependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  const attendanceProvider = dependencies.attendanceProvider;

  return Object.freeze({
    buildEmployeeAttendance,
    buildOwnAttendance,
    buildPayrollWorkbench,
    buildPayrollReadiness,
    precheckAttendanceSync,
    syncAttendance,
    reviewAttendanceDay,
    savePayrollPolicyVersion,
    generatePayrollDraft,
    updatePayrollLineAdjustment,
    transitionPayrollRun,
    buildPayrollHistory,
    buildPayrollExport,
    createPayrollExport,
  });

  function buildOwnAttendance({ workspace, authContext, month } = {}) {
    const employeeId = cleanText(
      authContext?.user?.employeeId ?? authContext?.employeeId ?? authContext?.user?.employee_id,
    );
    if (!employeeId) {
      throw businessError(
        403,
        "ATTENDANCE_SELF_EMPLOYEE_ID_REQUIRED",
        "当前登录账号尚未绑定正式员工编号，无法查看本人考勤。",
      );
    }
    return buildEmployeeAttendance({ workspace, employeeId, month, selfView: true });
  }

  function buildEmployeeAttendance({ workspace, employeeId, month, selfView = false } = {}) {
    const safeMonth = normalizeMonth(month, now());
    const calculationAsOf = payrollCalculationAsOf(safeMonth, now());
    const employee = findEmployee(workspace, employeeId);
    if (!employee) throw businessError(404, "ATTENDANCE_EMPLOYEE_NOT_FOUND", "员工档案不存在。");
    const days = buildAttendanceDays({ workspace, employee, month: safeMonth });
    const confirmedDays = days.filter((day) => day.status !== "pending_review");
    const totalWorkMinutes = confirmedDays.reduce((sum, day) => sum + day.workMinutes, 0);
    const pendingExceptionCount = days.filter((day) => day.status === "pending_review").length;
    const activePolicy = findActivePayrollPolicy(workspace, `${safeMonth}-01`);
    const estimate = activePolicy && confirmedDays.length
      ? calculatePayrollEstimate({ employee, days: confirmedDays, policyVersion: activePolicy, asOf: calculationAsOf })
      : null;
    return {
      employee: employeeProjection(employee, calculationAsOf),
      month: safeMonth,
      days,
      summary: {
        attendanceDayCount: days.length,
        totalWorkMinutes,
        totalWorkHours: round(totalWorkMinutes / 60, 2),
        pendingExceptionCount,
        estimatedExcludedDayCount: days.length - confirmedDays.length,
        attendanceMapped: Boolean(employee.attendanceProvider && employee.attendanceExternalId),
      },
      payrollEstimate: estimate,
      estimateStatus: !activePolicy ? "policy_not_published" : confirmedDays.length ? "available" : "attendance_not_available",
      estimateLabel: !activePolicy ? "计薪规则未发布" : confirmedDays.length ? "截至今日预估" : "本月尚无可计薪考勤",
      selfView,
      generatedAt: now().toISOString(),
    };
  }

  function buildPayrollWorkbench({ workspace, month } = {}) {
    const safeMonth = normalizeMonth(month, now());
    const calculationAsOf = payrollCalculationAsOf(safeMonth, now());
    const activePolicy = findActivePayrollPolicy(workspace, `${safeMonth}-01`);
    const attendanceImportCoverage = buildVerifiedAttendanceImportCoverage(workspace, safeMonth, now());
    const verifiedAttendanceImports = attendanceImportCoverage.verifiedImports;
    const employees = employeesForPayrollMonth(workspace, safeMonth)
      .map((employee) => {
        const days = buildAttendanceDays({ workspace, employee, month: safeMonth });
        const confirmedDays = days.filter((day) => day.status !== "pending_review");
        const totalWorkMinutes = confirmedDays.reduce((sum, day) => sum + day.workMinutes, 0);
        const pendingExceptionCount = days.filter((day) => day.status === "pending_review").length;
        const estimate = activePolicy && confirmedDays.length
          ? calculatePayrollEstimate({ employee, days: confirmedDays, policyVersion: activePolicy, asOf: calculationAsOf })
          : null;
        const blockers = employeePayrollInputBlockers(employee, days, safeMonth);
        if (!activePolicy) blockers.push("计薪规则未发布");
        if (pendingExceptionCount) blockers.push(`${pendingExceptionCount} 天考勤待复核`);
        if (!attendanceImportCoverage.periodClosed) blockers.push("计薪月份尚未结束");
        else if (!attendanceImportCoverage.complete) blockers.push("整月考勤导入未完成");
        return {
          ...employeeProjection(employee, calculationAsOf),
          totalWorkMinutes,
          totalWorkHours: round(totalWorkMinutes / 60, 2),
          attendanceDayCount: days.length,
          pendingExceptionCount,
          estimate,
          blockers,
          readyForDraft: blockers.length === 0,
        };
      });
    const payrollRuns = (workspace?.payrollRuns ?? [])
      .filter((run) => run.payrollMonth === safeMonth)
      .sort((left, right) => Number(right.revision) - Number(left.revision));
    return {
      month: safeMonth,
      policyVersion: activePolicy ? policyProjection(activePolicy) : null,
      employees,
      payrollRuns,
      summary: {
        employeeCount: employees.length,
        readyCount: employees.filter((employee) => employee.readyForDraft).length,
        blockedCount: employees.filter((employee) => !employee.readyForDraft).length,
        verifiedAttendanceImportCount: verifiedAttendanceImports.length,
        payrollPeriodClosed: attendanceImportCoverage.periodClosed,
        attendanceCoverageComplete: attendanceImportCoverage.complete,
        attendanceCoverageGapCount: attendanceImportCoverage.gapCount,
        draftReady:
          employees.length > 0 &&
          employees.every((employee) => employee.readyForDraft) &&
          attendanceImportCoverage.complete,
        pendingAttendanceReviewCount: employees.reduce(
          (sum, employee) => sum + employee.pendingExceptionCount,
          0,
        ),
      },
      sourceStatus: resolveAttendanceSourceStatus(workspace, attendanceProvider),
    };
  }

  function buildPayrollReadiness({ workspace, month } = {}) {
    const workbench = buildPayrollWorkbench({ workspace, month });
    const employees = employeesForPayrollMonth(workspace, workbench.month);
    const activeEmployees = (workspace?.employees ?? []).filter(isCurrentPayrollEmployee);
    const hasPayrollEmployees = employees.length > 0;
    const activeEmployeeIds = new Set(activeEmployees.map((employee) => cleanText(employee.id)).filter(Boolean));
    const readyAccountEmployeeIds = new Set(
      (workspace?.users ?? [])
        .filter((user) => activeEmployeeIds.has(cleanText(user.employeeId)) && isPayrollSelfAccountReady(user))
        .map((user) => cleanText(user.employeeId)),
    );
    const attendanceImportCoverage = buildVerifiedAttendanceImportCoverage(workspace, workbench.month, now());
    const profileCompleteCount = employees.filter(
      (employee) => cleanText(employee.birthDate) && cleanText(employee.hireDate),
    ).length;
    const wageCompleteCount = employees.filter(
      (employee) => nonNegativeNumber(employee.baseHourlyWage) > 0 && cleanText(employee.wageEffectiveFrom),
    ).length;
    const attendanceMappedCount = employees.filter(
      (employee) => cleanText(employee.attendanceProvider) && cleanText(employee.attendanceExternalId),
    ).length;
    const repositoryKind = cleanText(workspace?.attendancePayrollRepository?.kind);
    const criteria = [
      readinessCriterion("postgres_repository", "工资考勤使用 PostgreSQL", repositoryKind === "postgres", {
        repositoryKind: repositoryKind || "未配置",
      }),
      readinessCriterion("attendance_source", "真实考勤来源已配置", workbench.sourceStatus.configured, {
        provider: workbench.sourceStatus.provider || "未配置",
      }),
      readinessCriterion("employee_profiles", "本月计薪员工出生和入职资料完整", hasPayrollEmployees && profileCompleteCount === employees.length, {
        readyCount: profileCompleteCount,
        totalCount: employees.length,
      }),
      readinessCriterion("wage_profiles", "本月计薪员工计薪基数和生效日期完整", hasPayrollEmployees && wageCompleteCount === employees.length, {
        readyCount: wageCompleteCount,
        totalCount: employees.length,
      }),
      readinessCriterion("attendance_mappings", "本月计薪员工考勤身份映射完整", hasPayrollEmployees && attendanceMappedCount === employees.length, {
        readyCount: attendanceMappedCount,
        totalCount: employees.length,
      }),
      readinessCriterion("payroll_policy", "本月计薪规则已发布", Boolean(workbench.policyVersion), {
        versionId: workbench.policyVersion?.id || "",
      }),
      readinessCriterion("attendance_import", "本月自然月考勤已整月同步且无未匹配身份", attendanceImportCoverage.complete, {
        verifiedBatchCount: attendanceImportCoverage.verifiedImports.length,
        periodClosed: attendanceImportCoverage.periodClosed,
        coverageGapCount: attendanceImportCoverage.gapCount,
      }),
      readinessCriterion("attendance_reviews", "本月考勤异常已全部复核", workbench.summary.pendingAttendanceReviewCount === 0, {
        pendingCount: workbench.summary.pendingAttendanceReviewCount,
      }),
      readinessCriterion("employee_self_accounts", "当前在职员工本人账号已完成启用和改密", activeEmployees.length > 0 && readyAccountEmployeeIds.size === activeEmployees.length, {
        readyCount: readyAccountEmployeeIds.size,
        totalCount: activeEmployees.length,
      }),
    ];
    const blockingCriteria = criteria.filter((item) => item.status !== "passed");
    return {
      status: blockingCriteria.length ? "blocked" : "ready",
      ready: blockingCriteria.length === 0,
      month: workbench.month,
      summary: {
        passedCount: criteria.length - blockingCriteria.length,
        totalCount: criteria.length,
        blockingCount: blockingCriteria.length,
        employeeCount: employees.length,
      },
      criteria,
      blockingCriteria,
      safeguards: {
        employeeIdentitiesExposed: false,
        attendanceTokenExposed: false,
        connectionStringExposed: false,
        nonMutating: true,
      },
      checkedAt: now().toISOString(),
    };
  }

  async function precheckAttendanceSync({ workspace, body = {} } = {}) {
    const { providerKey, rangeStart, rangeEnd, fetched } = await fetchAttendanceSourceRecords({
      workspace,
      body,
    });
    const assessment = assessAttendanceSource({ workspace, providerKey, rangeStart, rangeEnd, fetched });
    return {
      status: assessment.ready ? "passed" : "blocked",
      ready: assessment.ready,
      provider: providerKey,
      rangeStart,
      rangeEnd,
      summary: assessment.summary,
      employeeMappingCoverage: {
        mappedCount: assessment.uniquelyMappedEmployeeCount,
        totalCount: assessment.employeeCount,
        complete: assessment.employeeCount > 0 && assessment.uniquelyMappedEmployeeCount === assessment.employeeCount,
      },
      blockingReasons: assessment.blockingReasons,
      importRecommended: assessment.ready && assessment.summary.newRecordCount > 0,
      safeguards: {
        readOnly: true,
        formalDataWritten: false,
        employeeIdentitiesExposed: false,
        externalPersonIdsExposed: false,
        punchIdsExposed: false,
        sourcePayloadExposed: false,
        attendanceTokenExposed: false,
      },
      checkedAt: now().toISOString(),
    };
  }

  async function syncAttendance({ workspace, body = {}, operatorId } = {}) {
    const { providerKey, rangeStart, rangeEnd, fetched } = await fetchAttendanceSourceRecords({
      workspace,
      body,
    });
    const assessment = assessAttendanceSource({ workspace, providerKey, rangeStart, rangeEnd, fetched });
    if (!assessment.ready) {
      throw businessError(
        409,
        "ATTENDANCE_SYNC_PRECHECK_BLOCKED",
        "正式考勤导入前的服务端来源复核未通过；请先修复预检阻塞项后重试。",
      );
    }
    const importedAt = now().toISOString();
    const punches = [];
    for (const record of fetched) {
      const externalPunchId = cleanText(record?.externalPunchId ?? record?.id);
      const externalEmployeeId = cleanText(record?.externalEmployeeId ?? record?.employeeId);
      const punchedAt = cleanText(record?.punchedAt ?? record?.time);
      const employeeId = assessment.mappings.get(externalEmployeeId)[0].id;
      punches.push({
        id: `ATP-${randomUUID()}`,
        provider: providerKey,
        externalPunchId,
        employeeId,
        externalEmployeeId,
        punchedAt: new Date(punchedAt).toISOString(),
        localWorkDate: normalizeSourceLocalDate(record?.localWorkDate, punchedAt),
        eventType: cleanText(record?.eventType) || "punch",
        sourceHash: sha256(JSON.stringify(record ?? {})),
        rawPayload: record && typeof record === "object" ? record : {},
        createdAt: importedAt,
      });
    }
    const importablePunches = punches.filter((punch) => !assessment.existingKeys.has(punch.externalPunchId));
    const batch = {
      id: `ATB-${randomUUID()}`,
      provider: providerKey,
      rangeStart,
      rangeEnd,
      status: "completed",
      fetchedCount: fetched.length,
      importedCount: importablePunches.length,
      duplicateCount: assessment.summary.alreadyImportedRecordCount,
      unmatchedCount: 0,
      issues: [],
      requestedBy: operatorId,
      createdAt: importedAt,
      completedAt: importedAt,
    };
    return workspace.attendancePayrollRepository.importPunches({
      workspace,
      batch,
      punches: importablePunches,
    });
  }

  async function fetchAttendanceSourceRecords({ workspace, body = {} } = {}) {
    const provider = attendanceProvider ?? workspace?.attendanceProvider;
    if (typeof provider?.fetchPunches !== "function") {
      throw businessError(
        503,
        "ATTENDANCE_PROVIDER_NOT_CONFIGURED",
        "真实考勤来源尚未配置，系统不会使用示例打卡数据。",
      );
    }
    const rangeStart = normalizeTimestamp(body.rangeStart, "rangeStart");
    const rangeEnd = normalizeTimestamp(body.rangeEnd, "rangeEnd");
    if (Date.parse(rangeEnd) <= Date.parse(rangeStart)) {
      throw businessError(400, "ATTENDANCE_SYNC_RANGE_INVALID", "考勤同步结束时间必须晚于开始时间。");
    }
    const providerKey = cleanText(provider.key ?? body.provider).toLowerCase();
    if (!providerKey) {
      throw businessError(500, "ATTENDANCE_PROVIDER_KEY_REQUIRED", "考勤来源缺少稳定来源标识。");
    }
    const fetched = await provider.fetchPunches({ rangeStart, rangeEnd });
    if (!Array.isArray(fetched)) {
      throw businessError(502, "ATTENDANCE_PROVIDER_RESPONSE_INVALID", "考勤来源返回的数据格式无效。");
    }
    return { providerKey, rangeStart, rangeEnd, fetched };
  }

  async function reviewAttendanceDay({ workspace, employeeId, workDate, body = {}, operatorId } = {}) {
    const employee = findEmployee(workspace, employeeId);
    if (!employee) throw businessError(404, "ATTENDANCE_EMPLOYEE_NOT_FOUND", "员工档案不存在。");
    if (!isValidDateOnly(cleanText(workDate))) {
      throw businessError(400, "ATTENDANCE_WORK_DATE_INVALID", "考勤日期格式无效。");
    }
    const status = cleanText(body.status);
    if (!new Set(["approved", "adjusted", "rejected"]).has(status)) {
      throw businessError(400, "ATTENDANCE_REVIEW_STATUS_INVALID", "考勤复核状态无效。");
    }
    const explanation = cleanText(body.explanation);
    if (!explanation) {
      throw businessError(400, "ATTENDANCE_REVIEW_EXPLANATION_REQUIRED", "考勤复核必须填写说明。");
    }
    const adjustedWorkMinutes =
      status === "adjusted" ? nonNegativeInteger(body.adjustedWorkMinutes, "adjustedWorkMinutes") : null;
    const changedAt = now().toISOString();
    const existing = (workspace.attendanceDayReviews ?? []).find(
      (review) => review.employeeId === employeeId && review.workDate === workDate,
    );
    const review = {
      id: existing?.id || `ADR-${randomUUID()}`,
      employeeId,
      workDate,
      status,
      explanation,
      adjustedWorkMinutes,
      evidenceAttachmentIds: Array.isArray(body.evidenceAttachmentIds)
        ? body.evidenceAttachmentIds.map(cleanText).filter(Boolean)
        : [],
      reviewedBy: operatorId,
      reviewedAt: changedAt,
      createdAt: existing?.createdAt || changedAt,
      updatedAt: changedAt,
    };
    return workspace.attendancePayrollRepository.saveDayReview({ workspace, review });
  }

  async function savePayrollPolicyVersion({ workspace, body = {}, operatorId } = {}) {
    const status = cleanText(body.status) || "draft";
    if (!new Set(["draft", "published", "retired"]).has(status)) {
      throw businessError(400, "PAYROLL_POLICY_STATUS_INVALID", "计薪规则状态无效。");
    }
    const effectiveFrom = normalizeIsoDate(body.effectiveFrom, "effectiveFrom");
    const effectiveTo = body.effectiveTo ? normalizeIsoDate(body.effectiveTo, "effectiveTo") : "";
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw businessError(400, "PAYROLL_POLICY_DATE_RANGE_INVALID", "计薪规则结束日期不能早于开始日期。");
    }
    const versionLabel = cleanText(body.versionLabel);
    if (!versionLabel || versionLabel.length > 120) {
      throw businessError(400, "PAYROLL_POLICY_VERSION_LABEL_INVALID", "计薪规则版本名称必填且不能超过 120 个字符。");
    }
    const policy = validatePolicy(body.policy);
    const changedAt = now().toISOString();
    const requestedId = cleanText(body.id);
    const existing = requestedId
      ? (workspace?.payrollPolicyVersions ?? []).find((item) => cleanText(item.id) === requestedId)
      : null;
    if (!existing && status === "published") {
      throw businessError(
        409,
        "PAYROLL_POLICY_DRAFT_REQUIRED",
        "正式计薪规则必须先保存草稿，再发布同一版本。",
      );
    }
    if (!existing && status === "retired") {
      throw businessError(409, "PAYROLL_POLICY_RETIRE_TARGET_REQUIRED", "只能停用已存在的计薪规则草稿。");
    }
    if (existing && new Set(["published", "retired"]).has(cleanText(existing.status))) {
      const unchanged =
        cleanText(existing.versionLabel) === versionLabel &&
        cleanText(existing.status) === status &&
        cleanText(existing.effectiveFrom) === effectiveFrom &&
        cleanText(existing.effectiveTo) === effectiveTo &&
        JSON.stringify(existing.policy ?? {}) === JSON.stringify(policy);
      if (unchanged) return { policyVersion: existing, idempotent: true };
      throw businessError(
        409,
        "PAYROLL_POLICY_PUBLISHED_IMMUTABLE",
        "已发布或已停用的计薪规则不可覆盖；请创建新版本。",
      );
    }
    if (
      status === "published" &&
      (workspace?.payrollPolicyVersions ?? []).some((item) =>
        cleanText(item.id) !== requestedId &&
        cleanText(item.status) === "published" &&
        cleanText(item.effectiveFrom) === effectiveFrom,
      )
    ) {
      throw businessError(
        409,
        "PAYROLL_POLICY_EFFECTIVE_DATE_CONFLICT",
        "同一生效日期已有已发布计薪规则；请新建其他生效日期的版本。",
      );
    }
    const policyVersion = {
      id: requestedId || `PPV-${randomUUID()}`,
      versionLabel,
      status,
      effectiveFrom,
      effectiveTo,
      policy,
      integrityDigest: sha256(JSON.stringify({ effectiveFrom, effectiveTo, policy })),
      createdBy: cleanText(existing?.createdBy) || operatorId,
      reviewedBy: status === "published" ? operatorId : "",
      reviewedAt: status === "published" ? changedAt : "",
      publishedAt: status === "published" ? changedAt : "",
      createdAt: cleanText(existing?.createdAt) || changedAt,
      updatedAt: changedAt,
    };
    return workspace.attendancePayrollRepository.savePolicyVersion({ workspace, policyVersion });
  }

  async function generatePayrollDraft({ workspace, body = {}, operatorId } = {}) {
    const month = normalizeMonth(body.month, now());
    const calculationAsOf = payrollCalculationAsOf(month, now());
    const activePolicy = findActivePayrollPolicy(workspace, `${month}-01`);
    if (!activePolicy) {
      throw businessError(409, "PAYROLL_POLICY_NOT_PUBLISHED", "该月份没有已发布的计薪规则，不能生成工资草稿。");
    }
    const employees = employeesForPayrollMonth(workspace, month);
    if (!employees.length) {
      throw businessError(409, "PAYROLL_EMPLOYEES_REQUIRED", "该月份没有处于任职区间的可计薪员工，不能生成工资草稿。");
    }
    const attendanceImportCoverage = buildVerifiedAttendanceImportCoverage(workspace, month, now());
    if (!attendanceImportCoverage.periodClosed) {
      throw businessError(
        409,
        "PAYROLL_MONTH_NOT_CLOSED",
        "该计薪月份尚未结束；正式工资草稿应在次月核对上月完整考勤后生成。",
      );
    }
    if (!attendanceImportCoverage.verifiedImports.length) {
      throw businessError(
        409,
        "PAYROLL_ATTENDANCE_IMPORT_REQUIRED",
        "本月尚无已完成且零未匹配身份的真实考勤导入，不能生成工资草稿。",
      );
    }
    if (!attendanceImportCoverage.complete) {
      throw businessError(
        409,
        "PAYROLL_ATTENDANCE_COVERAGE_INCOMPLETE",
        "本月真实考勤导入未连续覆盖整个自然月，不能生成工资草稿。",
      );
    }
    const blockers = [];
    const prepared = employees.map((employee) => {
      const days = buildAttendanceDays({ workspace, employee, month });
      const pending = days.filter((day) => day.status === "pending_review");
      for (const message of employeePayrollInputBlockers(employee, days, month)) {
        blockers.push({ employeeId: employee.id, message });
      }
      if (pending.length) blockers.push({ employeeId: employee.id, message: `${pending.length} 天考勤待复核` });
      return { employee, days };
    });
    if (blockers.length) {
      const error = businessError(409, "PAYROLL_DRAFT_BLOCKED", "存在未完成的员工档案或考勤复核，不能生成工资草稿。");
      error.details = { blockers };
      throw error;
    }
    const existingRevisions = (workspace.payrollRuns ?? [])
      .filter((run) => run.payrollMonth === month)
      .map((run) => Number(run.revision) || 0);
    const revision = Math.max(0, ...existingRevisions) + 1;
    const changedAt = now().toISOString();
    const payrollRun = {
      id: `PAY-${month.replace("-", "")}-${revision}-${randomUUID().slice(0, 8)}`,
      payrollMonth: month,
      policyVersionId: activePolicy.id,
      status: "draft",
      revision,
      generatedBy: operatorId,
      generatedAt: changedAt,
      reviewedBy: "",
      reviewedAt: "",
      lockedBy: "",
      lockedAt: "",
      paidBy: "",
      paidAt: "",
      paymentReference: "",
      createdAt: changedAt,
      updatedAt: changedAt,
    };
    const payrollLines = prepared.map(({ employee, days }) => {
      const calculation = calculatePayrollEstimate({ employee, days, policyVersion: activePolicy, asOf: calculationAsOf });
      return {
        id: `PAYL-${randomUUID()}`,
        payrollRunId: payrollRun.id,
        employeeId: employee.id,
        attendanceWorkMinutes: calculation.totalWorkMinutes,
        baseWage: calculation.baseWage,
        positionAllowance: calculation.positionAllowance,
        seniorityAward: calculation.seniorityAward,
        performanceAward: 0,
        overtimeWage: calculation.overtimeWage,
        leaveDeduction: 0,
        otherDeduction: 0,
        grossWage: calculation.grossWage,
        netWage: calculation.netWage,
        calculation,
        createdAt: changedAt,
        updatedAt: changedAt,
      };
    });
    return workspace.attendancePayrollRepository.createPayrollRun({
      workspace,
      payrollRun,
      payrollLines,
      expectedLatestRevision: revision - 1,
    });
  }

  async function updatePayrollLineAdjustment({ workspace, payrollRunId, employeeId, body = {}, operatorId } = {}) {
    const payrollRun = (workspace.payrollRuns ?? []).find((run) => run.id === payrollRunId);
    if (!payrollRun) throw businessError(404, "PAYROLL_RUN_NOT_FOUND", "工资批次不存在。");
    if (payrollRun.status !== "draft") {
      throw businessError(409, "PAYROLL_LINE_ADJUSTMENT_LOCKED", "只有工资草稿可以调整；复核后必须生成新版本。");
    }
    const employee = findEmployee(workspace, employeeId);
    if (!employee) throw businessError(404, "ATTENDANCE_EMPLOYEE_NOT_FOUND", "员工档案不存在。");
    const current = (workspace.payrollLines ?? []).find(
      (line) => line.payrollRunId === payrollRunId && line.employeeId === employeeId,
    );
    if (!current) throw businessError(404, "PAYROLL_LINE_NOT_FOUND", "工资明细不存在。");
    const reason = cleanText(body.reason);
    if (!reason) throw businessError(400, "PAYROLL_ADJUSTMENT_REASON_REQUIRED", "绩效、请假或扣款调整必须填写依据。");
    if (reason.length > 500) throw businessError(400, "PAYROLL_ADJUSTMENT_REASON_TOO_LONG", "调整依据不能超过 500 个字符。");
    const performanceAward = payrollMoney(body.performanceAward, "performanceAward");
    const leaveDeduction = payrollMoney(body.leaveDeduction, "leaveDeduction");
    const otherDeduction = payrollMoney(body.otherDeduction, "otherDeduction");
    const previousValues = adjustmentValues(current);
    const newValues = { performanceAward, leaveDeduction, otherDeduction };
    const evidenceAttachmentIds = uniqueTextList(body.evidenceAttachmentIds);
    const amountChanged = Object.keys(newValues).some(
      (key) => round(nonNegativeNumber(previousValues[key]), 2) !== round(nonNegativeNumber(newValues[key]), 2),
    );
    if (amountChanged && evidenceAttachmentIds.length === 0) {
      throw businessError(
        400,
        "PAYROLL_ADJUSTMENT_EVIDENCE_REQUIRED",
        "工资金额发生变化时必须至少上传 1 份调整凭证。",
      );
    }
    if (evidenceAttachmentIds.length > 5) {
      throw businessError(400, "PAYROLL_ADJUSTMENT_EVIDENCE_LIMIT_EXCEEDED", "工资调整凭证最多上传 5 份。");
    }
    for (const attachmentId of evidenceAttachmentIds) {
      const evidence = validateBusinessAttachment({
        workspace,
        attachmentId,
        findAttachment: (source, id) => (source?.attachments ?? []).find(
          (item) => cleanText(item.attachmentId ?? item.id) === id,
        ),
        expectedOwnerType: "payroll_run",
        expectedOwnerId: payrollRunId,
        expectedPurpose: "payroll_adjustment_evidence",
        expectedUploaderId: operatorId,
        allowedFileTypes: ["image", "pdf"],
        allowedMimePrefixes: ["image/"],
        allowedMimeTypes: ["application/pdf"],
        requireContent: true,
        requirePositiveSize: true,
        maxBytes: 50 * 1024 * 1024,
        errorCodePrefix: "PAYROLL_ADJUSTMENT_EVIDENCE",
        label: "工资调整凭证",
      });
      if (!evidence.ok) throw businessError(evidence.statusCode, evidence.errorCode, evidence.message);
      const evidenceEmployeeId = cleanText(evidence.attachment?.metadata?.employeeId);
      if (!evidenceEmployeeId) {
        throw businessError(422, "PAYROLL_ADJUSTMENT_EVIDENCE_EMPLOYEE_REQUIRED", "工资调整凭证必须绑定当前员工编号。");
      }
      if (evidenceEmployeeId !== employeeId) {
        throw businessError(422, "PAYROLL_ADJUSTMENT_EVIDENCE_EMPLOYEE_MISMATCH", "工资调整凭证不属于当前员工。");
      }
    }
    const changedAt = now().toISOString();
    const grossWage = round(
      nonNegativeNumber(current.baseWage) +
      nonNegativeNumber(current.positionAllowance) +
      nonNegativeNumber(current.seniorityAward) +
      performanceAward +
      nonNegativeNumber(current.overtimeWage),
      2,
    );
    const netWage = round(Math.max(0, grossWage - leaveDeduction - otherDeduction), 2);
    const payrollLine = {
      ...current,
      ...newValues,
      grossWage,
      netWage,
      calculation: {
        ...(current.calculation ?? {}),
        manualAdjustment: {
          ...newValues,
          reason,
          changedBy: operatorId,
          changedAt,
          evidenceAttachmentIds,
        },
      },
      updatedAt: changedAt,
    };
    const adjustment = {
      id: `PAYA-${randomUUID()}`,
      payrollLineId: current.id,
      payrollRunId,
      employeeId,
      ...newValues,
      reason,
      previousValues,
      newValues,
      evidenceAttachmentIds,
      changedBy: operatorId,
      changedAt,
    };
    return workspace.attendancePayrollRepository.savePayrollLineAdjustment({
      workspace,
      payrollLine,
      adjustment,
    });
  }

  async function transitionPayrollRun({ workspace, payrollRunId, action, body = {}, operatorId } = {}) {
    const current = (workspace.payrollRuns ?? []).find((run) => run.id === payrollRunId);
    if (!current) throw businessError(404, "PAYROLL_RUN_NOT_FOUND", "工资批次不存在。");
    const targetStatus = { review: "reviewed", lock: "locked", payment: "paid" }[action];
    if (!targetStatus || !payrollRunTransitions[current.status]?.has(targetStatus)) {
      throw businessError(409, "PAYROLL_RUN_TRANSITION_INVALID", "工资批次当前状态不允许执行该操作。");
    }
    if (targetStatus === "paid" && !cleanText(body.paymentReference)) {
      throw businessError(400, "PAYROLL_PAYMENT_REFERENCE_REQUIRED", "确认发薪必须填写付款凭证编号。");
    }
    const changedAt = now().toISOString();
    const payrollRun = {
      ...current,
      status: targetStatus,
      reviewedBy: targetStatus === "reviewed" ? operatorId : current.reviewedBy,
      reviewedAt: targetStatus === "reviewed" ? changedAt : current.reviewedAt,
      lockedBy: targetStatus === "locked" ? operatorId : current.lockedBy,
      lockedAt: targetStatus === "locked" ? changedAt : current.lockedAt,
      paidBy: targetStatus === "paid" ? operatorId : current.paidBy,
      paidAt: targetStatus === "paid" ? changedAt : current.paidAt,
      paymentReference: targetStatus === "paid" ? cleanText(body.paymentReference) : current.paymentReference,
      updatedAt: changedAt,
    };
    return workspace.attendancePayrollRepository.transitionPayrollRun({
      workspace,
      payrollRun,
      expectedStatus: current.status,
    });
  }

  function buildPayrollHistory({ workspace, employeeId, limit = 24 } = {}) {
    const employee = findEmployee(workspace, employeeId);
    if (!employee) throw businessError(404, "ATTENDANCE_EMPLOYEE_NOT_FOUND", "员工档案不存在。");
    const safeLimit = Math.min(60, Math.max(1, Number.parseInt(limit, 10) || 24));
    const runs = new Map((workspace.payrollRuns ?? []).map((run) => [run.id, run]));
    const allItems = (workspace.payrollLines ?? [])
      .filter((line) => line.employeeId === employeeId && runs.has(line.payrollRunId))
      .map((line) => ({
        payrollRun: runs.get(line.payrollRunId),
        payrollLine: line,
        adjustments: (workspace.payrollLineAdjustments ?? [])
          .filter((adjustment) => adjustment.payrollLineId === line.id)
          .sort((left, right) => String(right.changedAt).localeCompare(String(left.changedAt))),
      }))
      .sort((left, right) =>
        right.payrollRun.payrollMonth.localeCompare(left.payrollRun.payrollMonth) ||
        Number(right.payrollRun.revision) - Number(left.payrollRun.revision),
      );
    return {
      employee: employeeProjection(employee, now()),
      items: allItems.slice(0, safeLimit),
      total: allItems.length,
    };
  }

  function buildPayrollExport({ workspace, payrollRunId } = {}) {
    const payrollRun = (workspace.payrollRuns ?? []).find((run) => run.id === payrollRunId);
    if (!payrollRun) throw businessError(404, "PAYROLL_RUN_NOT_FOUND", "工资批次不存在。");
    const employeeMap = new Map((workspace.employees ?? []).map((employee) => [employee.id, employee]));
    const columns = [
      ["employeeId", "员工编号"], ["name", "员工"], ["roleName", "岗位"],
      ["attendanceHours", "确认工时"], ["baseWage", "基础工资"],
      ["positionAllowance", "岗位补贴"], ["seniorityAward", "工龄奖"],
      ["performanceAward", "绩效/奖励"], ["overtimeWage", "加班工资"],
      ["leaveDeduction", "请假/缺勤扣款"], ["otherDeduction", "其他扣款"],
      ["grossWage", "应发工资"], ["netWage", "实发工资"],
    ].map(([key, label]) => ({ key, label }));
    const rows = (workspace.payrollLines ?? [])
      .filter((line) => line.payrollRunId === payrollRunId)
      .sort((left, right) => left.employeeId.localeCompare(right.employeeId))
      .map((line) => {
        const employee = employeeMap.get(line.employeeId) ?? {};
        return {
          employeeId: line.employeeId,
          name: cleanText(employee.name),
          roleName: cleanText(employee.roleName),
          attendanceHours: round(nonNegativeNumber(line.attendanceWorkMinutes) / 60, 2),
          baseWage: nonNegativeNumber(line.baseWage),
          positionAllowance: nonNegativeNumber(line.positionAllowance),
          seniorityAward: nonNegativeNumber(line.seniorityAward),
          performanceAward: nonNegativeNumber(line.performanceAward),
          overtimeWage: nonNegativeNumber(line.overtimeWage),
          leaveDeduction: nonNegativeNumber(line.leaveDeduction),
          otherDeduction: nonNegativeNumber(line.otherDeduction),
          grossWage: nonNegativeNumber(line.grossWage),
          netWage: nonNegativeNumber(line.netWage),
        };
      });
    const digest = sha256(JSON.stringify({ payrollRun, columns, rows }));
    return {
      fileName: `工资表-${payrollRun.payrollMonth}-第${payrollRun.revision}版-${payrollRun.status}.csv`,
      payrollRun,
      columns,
      rows,
      digest,
      generatedAt: now().toISOString(),
    };
  }

  async function createPayrollExport({ workspace, payrollRunId, operatorId } = {}) {
    const payload = buildPayrollExport({ workspace, payrollRunId });
    if (!new Set(["reviewed", "locked", "paid"]).has(payload.payrollRun.status)) {
      throw businessError(
        409,
        "PAYROLL_EXPORT_REVIEW_REQUIRED",
        "工资草稿尚未复核，不能导出正式工资表。",
      );
    }
    const exportEvent = {
      id: `PAYX-${randomUUID()}`,
      payrollRunId: payload.payrollRun.id,
      payrollMonth: payload.payrollRun.payrollMonth,
      revision: payload.payrollRun.revision,
      runStatus: payload.payrollRun.status,
      fileName: payload.fileName,
      contentDigest: payload.digest,
      rowCount: payload.rows.length,
      exportedBy: cleanText(operatorId),
      exportedAt: payload.generatedAt,
    };
    const persisted = await workspace.attendancePayrollRepository.recordPayrollExport({
      workspace,
      exportEvent,
    });
    return { ...payload, exportEvent: persisted.exportEvent };
  }
}

export function buildAttendanceDays({ workspace, employee, month } = {}) {
  const reviews = new Map(
    (workspace?.attendanceDayReviews ?? [])
      .filter((review) => review.employeeId === employee.id && review.workDate.startsWith(month))
      .map((review) => [review.workDate, review]),
  );
  const grouped = new Map();
  for (const punch of workspace?.attendancePunches ?? []) {
    if (punch.employeeId !== employee.id || !cleanText(punch.localWorkDate).startsWith(month)) continue;
    if (!grouped.has(punch.localWorkDate)) grouped.set(punch.localWorkDate, []);
    grouped.get(punch.localWorkDate).push(punch);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([workDate, punches]) => {
      const sorted = [...punches].sort((left, right) => Date.parse(left.punchedAt) - Date.parse(right.punchedAt));
      const expectedPunchCount = isSilkScreenEmployee(employee) ? 2 : 4;
      const rawWorkMinutes = pairwiseMinutes(sorted.map((punch) => punch.punchedAt));
      const review = reviews.get(workDate);
      const reviewStatus = cleanText(review?.status);
      const adjusted = reviewStatus === "adjusted" && Number.isFinite(Number(review.adjustedWorkMinutes));
      const rejected = reviewStatus === "rejected";
      const workMinutes = rejected
        ? 0
        : adjusted
          ? Math.max(0, Number(review.adjustedWorkMinutes))
          : rawWorkMinutes;
      const status = rejected
        ? "rejected"
        : reviewStatus === "approved" || reviewStatus === "adjusted"
          ? "reviewed"
        : sorted.length === expectedPunchCount && sorted.length % 2 === 0
          ? "normal"
          : "pending_review";
      return {
        workDate,
        punches: sorted.map((punch) => ({ id: punch.id, punchedAt: punch.punchedAt })),
        punchTimes: sorted.map((punch) => formatLocalTime(punch.punchedAt)),
        expectedPunchCount,
        actualPunchCount: sorted.length,
        rawWorkMinutes,
        workMinutes,
        workHours: round(workMinutes / 60, 2),
        status,
        statusLabel: status === "normal"
          ? "正常"
          : status === "reviewed"
            ? "已复核"
            : status === "rejected"
              ? "暂不计薪"
              : "待复核",
        review: review ?? null,
      };
    });
}

function calculatePayrollEstimate({ employee, days, policyVersion, asOf }) {
  const policy = policyVersion.policy ?? {};
  const regularMinutesPerDay = Number(policy.regularMinutesPerDay);
  const overtimeMultiplier = Number(policy.overtimeMultiplier);
  const totalWorkMinutes = days.reduce((sum, day) => sum + day.workMinutes, 0);
  const regularMinutes = days.reduce(
    (sum, day) => sum + Math.min(day.workMinutes, regularMinutesPerDay),
    0,
  );
  const overtimeMinutes = Math.max(0, totalWorkMinutes - regularMinutes);
  const hourlyWage = nonNegativeNumber(employee.baseHourlyWage);
  const allowanceHourly = nonNegativeNumber(employee.positionAllowanceHourly);
  const baseWage = round((regularMinutes / 60) * hourlyWage, 2);
  const positionAllowance = round((regularMinutes / 60) * allowanceHourly, 2);
  const overtimeWage = round((overtimeMinutes / 60) * hourlyWage * overtimeMultiplier, 2);
  const seniorityYears = completedYears(employee.hireDate, asOf);
  const seniorityAward = resolveSeniorityAward(policy.seniorityAwards, seniorityYears);
  const grossWage = round(baseWage + positionAllowance + overtimeWage + seniorityAward, 2);
  return {
    totalWorkMinutes,
    regularMinutes,
    overtimeMinutes,
    baseWage,
    positionAllowance,
    overtimeWage,
    seniorityYears,
    seniorityAward,
    grossWage,
    netWage: grossWage,
    policyVersionId: policyVersion.id,
    policyVersionLabel: policyVersion.versionLabel,
    asOf: asOf.toISOString(),
    provisional: true,
  };
}

function validatePolicy(value) {
  const policy = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const regularMinutesPerDay = Number(policy.regularMinutesPerDay);
  const overtimeMultiplier = Number(policy.overtimeMultiplier);
  if (!Number.isInteger(regularMinutesPerDay) || regularMinutesPerDay <= 0 || regularMinutesPerDay > 1440) {
    throw businessError(400, "PAYROLL_POLICY_REGULAR_MINUTES_INVALID", "计薪规则的标准日工时分钟数无效。");
  }
  if (!Number.isFinite(overtimeMultiplier) || overtimeMultiplier < 1 || overtimeMultiplier > 5) {
    throw businessError(400, "PAYROLL_POLICY_OVERTIME_MULTIPLIER_INVALID", "加班倍率必须在 1 到 5 之间。");
  }
  const sourceAwards = policy.seniorityAwards === undefined ? [] : policy.seniorityAwards;
  if (!Array.isArray(sourceAwards) || sourceAwards.length > 20) {
    throw businessError(400, "PAYROLL_POLICY_SENIORITY_AWARDS_INVALID", "工龄奖必须是最多 20 档的规则列表。");
  }
  const usedYears = new Set();
  const seniorityAwards = sourceAwards.map((item) => {
    const minYears = Number(item?.minYears);
    const monthlyAmount = Number(item?.monthlyAmount);
    if (!Number.isInteger(minYears) || minYears < 0 || minYears > 80) {
      throw businessError(400, "PAYROLL_POLICY_SENIORITY_YEARS_INVALID", "工龄奖起算年限必须是 0 到 80 的整数。");
    }
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0 || monthlyAmount > 100000) {
      throw businessError(400, "PAYROLL_POLICY_SENIORITY_AMOUNT_INVALID", "工龄奖月金额必须在 0 到 100000 元之间。");
    }
    if (usedYears.has(minYears)) {
      throw businessError(400, "PAYROLL_POLICY_SENIORITY_TIER_DUPLICATE", "同一个工龄起算年限不能重复配置。");
    }
    usedYears.add(minYears);
    return { minYears, monthlyAmount: round(monthlyAmount, 2) };
  }).sort((left, right) => left.minYears - right.minYears);
  return {
    schemaVersion: "payroll-policy-v1",
    regularMinutesPerDay,
    overtimeMultiplier,
    seniorityAwards,
  };
}

function buildAttendanceMappingIndex(workspace, providerKey, rangeStart, rangeEnd) {
  const index = new Map();
  for (const employee of employeesForAttendanceRange(workspace, rangeStart, rangeEnd)) {
    if (cleanText(employee.attendanceProvider).toLowerCase() !== providerKey.toLowerCase()) continue;
    const externalId = cleanText(employee.attendanceExternalId);
    if (!externalId) continue;
    if (!index.has(externalId)) index.set(externalId, []);
    index.get(externalId).push(employee);
  }
  return index;
}

function assessAttendanceSource({ workspace, providerKey, rangeStart, rangeEnd, fetched = [] }) {
  const mappings = buildAttendanceMappingIndex(workspace, providerKey, rangeStart, rangeEnd);
  const existingKeys = new Set(
    (workspace?.attendancePunches ?? [])
      .filter((punch) => cleanText(punch.provider).toLowerCase() === providerKey)
      .map((punch) => cleanText(punch.externalPunchId))
      .filter(Boolean),
  );
  const employees = employeesForAttendanceRange(workspace, rangeStart, rangeEnd);
  const uniquelyMappedEmployeeCount = employees.filter((employee) => {
    if (cleanText(employee.attendanceProvider).toLowerCase() !== providerKey) return false;
    const externalId = cleanText(employee.attendanceExternalId);
    return externalId && (mappings.get(externalId) ?? []).length === 1;
  }).length;
  const seenExternalPunchIds = new Set();
  let validRecordCount = 0;
  let invalidRecordCount = 0;
  let outOfRangeRecordCount = 0;
  let duplicateSourceRecordCount = 0;
  let matchedRecordCount = 0;
  let unmatchedRecordCount = 0;
  let ambiguousMappingRecordCount = 0;
  let outOfEmploymentRecordCount = 0;
  let alreadyImportedRecordCount = 0;
  let newRecordCount = 0;
  for (const record of fetched) {
    const externalPunchId = cleanText(record?.externalPunchId ?? record?.id);
    const externalEmployeeId = cleanText(record?.externalEmployeeId ?? record?.employeeId);
    const punchedAt = cleanText(record?.punchedAt ?? record?.time);
    const sourceLocalWorkDate = cleanText(record?.localWorkDate);
    if (
      !externalPunchId ||
      !externalEmployeeId ||
      !isValidTimestamp(punchedAt) ||
      (sourceLocalWorkDate && !isValidDateOnly(sourceLocalWorkDate))
    ) {
      invalidRecordCount += 1;
      continue;
    }
    if (!timestampInsideHalfOpenRange(punchedAt, rangeStart, rangeEnd)) {
      outOfRangeRecordCount += 1;
      continue;
    }
    validRecordCount += 1;
    if (seenExternalPunchIds.has(externalPunchId)) {
      duplicateSourceRecordCount += 1;
      continue;
    }
    seenExternalPunchIds.add(externalPunchId);
    const mapping = mappings.get(externalEmployeeId) ?? [];
    const localWorkDate = sourceLocalWorkDate || normalizeSourceLocalDate("", punchedAt);
    if (mapping.length === 1 && employeeEmployedOnDate(mapping[0], localWorkDate)) matchedRecordCount += 1;
    else if (mapping.length === 1) outOfEmploymentRecordCount += 1;
    else if (mapping.length > 1) ambiguousMappingRecordCount += 1;
    else unmatchedRecordCount += 1;
    if (existingKeys.has(externalPunchId)) alreadyImportedRecordCount += 1;
    else newRecordCount += 1;
  }
  const blockingReasons = [];
  if (!fetched.length) blockingReasons.push(precheckBlocker("SOURCE_EMPTY", "所选时间范围没有返回打卡记录。", 1));
  if (invalidRecordCount) blockingReasons.push(precheckBlocker("INVALID_SOURCE_RECORDS", "考勤来源存在字段不完整或时间无效的记录。", invalidRecordCount));
  if (outOfRangeRecordCount) blockingReasons.push(precheckBlocker("OUT_OF_RANGE_SOURCE_RECORDS", "考勤来源返回了所选时间范围以外的记录。", outOfRangeRecordCount));
  if (duplicateSourceRecordCount) blockingReasons.push(precheckBlocker("DUPLICATE_SOURCE_RECORDS", "考勤来源在同一批次返回了重复打卡编号。", duplicateSourceRecordCount));
  if (unmatchedRecordCount) blockingReasons.push(precheckBlocker("UNMATCHED_EMPLOYEE_MAPPINGS", "考勤记录存在未绑定正式员工编号的人员。", unmatchedRecordCount));
  if (ambiguousMappingRecordCount) blockingReasons.push(precheckBlocker("AMBIGUOUS_EMPLOYEE_MAPPINGS", "考勤记录命中了重复人员映射。", ambiguousMappingRecordCount));
  if (outOfEmploymentRecordCount) blockingReasons.push(precheckBlocker("OUT_OF_EMPLOYMENT_RECORDS", "考勤记录落在员工入职前或离职后的日期。", outOfEmploymentRecordCount));
  const missingDepartureBoundaryCount = employees.filter(
    (employee) => isDeparted(employee) && !employeeDepartureDate(employee),
  ).length;
  if (missingDepartureBoundaryCount) {
    blockingReasons.push(precheckBlocker(
      "EMPLOYEE_DEPARTURE_BOUNDARY_MISSING",
      "本次同步范围包含离职员工，但其离职时间尚未形成正式持久化边界。",
      missingDepartureBoundaryCount,
    ));
  }
  if (uniquelyMappedEmployeeCount !== employees.length) {
    blockingReasons.push(precheckBlocker(
      "EMPLOYEE_MAPPING_COVERAGE_INCOMPLETE",
      "本次同步期间任职员工的正式考勤身份映射尚未全部完成。",
      employees.length - uniquelyMappedEmployeeCount,
    ));
  }
  return {
    ready: blockingReasons.length === 0,
    mappings,
    existingKeys,
    employeeCount: employees.length,
    uniquelyMappedEmployeeCount,
    blockingReasons,
    summary: {
      fetchedCount: fetched.length,
      validRecordCount,
      invalidRecordCount,
      outOfRangeRecordCount,
      duplicateSourceRecordCount,
      matchedRecordCount,
      unmatchedRecordCount,
      ambiguousMappingRecordCount,
      outOfEmploymentRecordCount,
      alreadyImportedRecordCount,
      newRecordCount,
    },
  };
}

function timestampInsideHalfOpenRange(value, rangeStart, rangeEnd) {
  const timestamp = Date.parse(value);
  return timestamp >= Date.parse(rangeStart) && timestamp < Date.parse(rangeEnd);
}

function findActivePayrollPolicy(workspace, effectiveDate) {
  return (workspace?.payrollPolicyVersions ?? [])
    .filter((policy) =>
      policy.status === "published" &&
      policy.effectiveFrom <= effectiveDate &&
      (!policy.effectiveTo || policy.effectiveTo >= effectiveDate),
    )
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ?? null;
}

function findEmployee(workspace, employeeId) {
  return (workspace?.employees ?? []).find((employee) => cleanText(employee.id) === cleanText(employeeId));
}

function employeeProjection(employee = {}, asOf = new Date()) {
  return {
    employeeId: cleanText(employee.id),
    name: cleanText(employee.name),
    roleName: cleanText(employee.roleName),
    workshop: cleanText(employee.defaultWorkshop),
    machineId: cleanText(employee.defaultMachineId),
    hireDate: cleanText(employee.hireDate),
    seniorityYears: completedYears(employee.hireDate, asOf),
    profileStatus: cleanText(employee.profileStatus),
    departedAt: cleanText(employee.departedAt),
    departureEffectiveDate: employeeDepartureDate(employee),
    departureDate: employeeDepartureDate(employee),
    attendanceMapped: Boolean(employee.attendanceProvider && employee.attendanceExternalId),
  };
}

function policyProjection(policy = {}) {
  return {
    id: policy.id,
    versionLabel: policy.versionLabel,
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo,
    integrityDigest: policy.integrityDigest,
  };
}

function resolveAttendanceSourceStatus(workspace, provider) {
  const effective = provider ?? workspace?.attendanceProvider;
  return {
    configured: typeof effective?.fetchPunches === "function",
    provider: cleanText(effective?.key),
    label: typeof effective?.fetchPunches === "function" ? "真实考勤来源已配置" : "真实考勤来源未配置",
  };
}

function isPayrollSelfAccountReady(user = {}) {
  const enabled = user.enabled !== false && (user.loginEnabled === true || user.accountEnabled === true);
  const passwordStatus = cleanText(user.passwordStatus).toLowerCase();
  return enabled && passwordStatus === "active" && user.mustChangePassword !== true;
}

function readinessCriterion(key, label, passed, evidence = {}) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    blocking: !passed,
    evidence,
  };
}

function precheckBlocker(code, message, count) {
  return {
    code,
    message,
    count: Math.max(0, Math.trunc(Number(count) || 0)),
  };
}

function pairwiseMinutes(timestamps = []) {
  let minutes = 0;
  for (let index = 0; index + 1 < timestamps.length; index += 2) {
    const start = Date.parse(timestamps[index]);
    const end = Date.parse(timestamps[index + 1]);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      minutes += Math.round((end - start) / 60000);
    }
  }
  return minutes;
}

function resolveSeniorityAward(tiers = [], years) {
  return round(
    (Array.isArray(tiers) ? tiers : [])
      .filter((tier) => Number(tier.minYears) <= years)
      .sort((left, right) => Number(right.minYears) - Number(left.minYears))[0]?.monthlyAmount ?? 0,
    2,
  );
}

function completedYears(value, now) {
  const text = cleanText(value);
  if (!text) return 0;
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date > now) return 0;
  let years = now.getUTCFullYear() - date.getUTCFullYear();
  if (
    now.getUTCMonth() < date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())
  ) years -= 1;
  return Math.max(0, years);
}

function isSilkScreenEmployee(employee = {}) {
  return `${cleanText(employee.roleName)} ${cleanText(employee.defaultWorkshop)}`.includes("丝印");
}

function isDeparted(employee = {}) {
  return ["departed", "left", "retired", "inactive_employee"].includes(
    cleanText(employee.profileStatus).toLowerCase(),
  );
}

function isCurrentPayrollEmployee(employee = {}) {
  return !isDeparted(employee) && cleanText(employee.profileStatus).toLowerCase() !== "merged_duplicate";
}

function employeesForPayrollMonth(workspace = {}, month) {
  const { startDate, endDate } = payrollMonthDateBounds(month);
  return (workspace?.employees ?? []).filter(
    (employee) => employeeEmploymentOverlaps(employee, startDate, endDate),
  );
}

function employeesForAttendanceRange(workspace = {}, rangeStart, rangeEnd) {
  const startDate = normalizeSourceLocalDate("", rangeStart);
  const endInstant = new Date(Math.max(Date.parse(rangeStart), Date.parse(rangeEnd) - 1)).toISOString();
  const endDate = normalizeSourceLocalDate("", endInstant);
  return (workspace?.employees ?? []).filter(
    (employee) => employeeEmploymentOverlaps(employee, startDate, endDate),
  );
}

function employeeEmploymentOverlaps(employee = {}, startDate, endDate) {
  if (cleanText(employee.profileStatus).toLowerCase() === "merged_duplicate") return false;
  const hireDate = cleanText(employee.hireDate);
  if (isValidDateOnly(hireDate) && hireDate > endDate) return false;
  const departureDate = employeeDepartureDate(employee);
  if (isDeparted(employee) && departureDate && departureDate < startDate) return false;
  return true;
}

function employeeEmployedOnDate(employee = {}, workDate) {
  if (!isValidDateOnly(workDate)) return false;
  if (cleanText(employee.profileStatus).toLowerCase() === "merged_duplicate") return false;
  const hireDate = cleanText(employee.hireDate);
  if (isValidDateOnly(hireDate) && workDate < hireDate) return false;
  const departureDate = employeeDepartureDate(employee);
  if (isDeparted(employee) && departureDate && workDate > departureDate) return false;
  return true;
}

function employeeDepartureDate(employee = {}) {
  const departureEffectiveDate = cleanText(
    employee.departureEffectiveDate ?? employee.departure_effective_date,
  );
  if (isValidDateOnly(departureEffectiveDate)) return departureEffectiveDate;
  const departedAt = cleanText(employee.departedAt ?? employee.departed_at);
  if (isValidDateOnly(departedAt)) return departedAt;
  if (!isValidTimestamp(departedAt)) return "";
  return normalizeSourceLocalDate("", departedAt);
}

function employeePayrollInputBlockers(employee = {}, days = [], month) {
  const blockers = [];
  const { endDate } = payrollMonthDateBounds(month);
  const hireDate = cleanText(employee.hireDate);
  const wageEffectiveFrom = cleanText(employee.wageEffectiveFrom);
  const departureDate = employeeDepartureDate(employee);
  if (!cleanText(employee.attendanceProvider) || !cleanText(employee.attendanceExternalId)) {
    blockers.push("考勤身份未绑定");
  }
  if (!hireDate) blockers.push("入职日期未维护");
  if (isDeparted(employee) && !departureDate) blockers.push("离职时间未维护");
  if (nonNegativeNumber(employee.baseHourlyWage) <= 0) blockers.push("基础时薪未维护");
  if (!wageEffectiveFrom) blockers.push("工资生效日期未维护");
  else if (wageEffectiveFrom > endDate) blockers.push("工资尚未在本月生效");
  if (!days.length) blockers.push("本月无已关联打卡");
  if (hireDate && days.some((day) => day.workDate < hireDate)) blockers.push("存在入职日期前的打卡");
  if (departureDate && days.some((day) => day.workDate > departureDate)) blockers.push("存在离职日期后的打卡");
  if (
    wageEffectiveFrom &&
    wageEffectiveFrom <= endDate &&
    days.some((day) => day.workDate < wageEffectiveFrom)
  ) {
    blockers.push("存在工资生效日期前的打卡");
  }
  return blockers;
}

function payrollMonthDateBounds(month) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  const startDate = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function payrollMoney(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100000000) {
    throw businessError(400, "PAYROLL_ADJUSTMENT_AMOUNT_INVALID", `${fieldName} 必须是 0 到 100000000 之间的金额。`);
  }
  return round(number, 2);
}

function adjustmentValues(line = {}) {
  return {
    performanceAward: nonNegativeNumber(line.performanceAward),
    leaveDeduction: nonNegativeNumber(line.leaveDeduction),
    otherDeduction: nonNegativeNumber(line.otherDeduction),
  };
}

function normalizeMonth(value, fallbackDate) {
  const text = cleanText(value);
  if (!text) return fallbackDate.toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
    throw businessError(400, "PAYROLL_MONTH_INVALID", "工资考勤月份格式无效。");
  }
  return text;
}

function payrollMonthTimestampRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    rangeStart: new Date(`${year}-${String(monthNumber).padStart(2, "0")}-01T00:00:00+08:00`).toISOString(),
    rangeEnd: new Date(
      `${monthNumber === 12 ? year + 1 : year}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, "0")}-01T00:00:00+08:00`,
    ).toISOString(),
  };
}

function payrollCalculationAsOf(month, currentDate) {
  const periodEndExclusive = Date.parse(payrollMonthTimestampRange(month).rangeEnd);
  const monthEnd = new Date(periodEndExclusive - 1);
  return currentDate.getTime() < monthEnd.getTime() ? new Date(currentDate) : monthEnd;
}

function findVerifiedAttendanceImports(workspace, month) {
  const payrollMonthRange = payrollMonthTimestampRange(month);
  return (workspace?.attendanceImportBatches ?? []).filter((batch) =>
    cleanText(batch.status) === "completed" &&
    nonNegativeNumber(batch.fetchedCount) > 0 &&
    nonNegativeNumber(batch.unmatchedCount) === 0 &&
    timestampRangesOverlap(
      batch.rangeStart,
      batch.rangeEnd,
      payrollMonthRange.rangeStart,
      payrollMonthRange.rangeEnd,
    ),
  );
}

function buildVerifiedAttendanceImportCoverage(workspace, month, asOf) {
  const monthRange = payrollMonthTimestampRange(month);
  const verifiedImports = findVerifiedAttendanceImports(workspace, month);
  const monthStart = Date.parse(monthRange.rangeStart);
  const monthEnd = Date.parse(monthRange.rangeEnd);
  const periodClosed = asOf.getTime() >= monthEnd;
  const intervals = verifiedImports
    .map((batch) => ({
      start: Math.max(monthStart, Date.parse(batch.rangeStart)),
      end: Math.min(monthEnd, Date.parse(batch.rangeEnd)),
    }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = monthStart;
  let gapCount = 0;
  for (const interval of intervals) {
    if (interval.start > cursor) gapCount += 1;
    if (interval.end > cursor) cursor = interval.end;
  }
  if (cursor < monthEnd) gapCount += 1;
  return {
    verifiedImports,
    periodClosed,
    complete: periodClosed && intervals.length > 0 && gapCount === 0 && cursor >= monthEnd,
    gapCount,
  };
}

function timestampRangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  if (![leftStart, leftEnd, rightStart, rightEnd].every(isValidTimestamp)) return false;
  return Date.parse(leftStart) < Date.parse(rightEnd) && Date.parse(leftEnd) > Date.parse(rightStart);
}

function normalizeIsoDate(value, fieldName) {
  const text = cleanText(value);
  const date = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw businessError(400, "PAYROLL_POLICY_DATE_INVALID", `${fieldName} 不是有效日期。`);
  }
  return text;
}

function normalizeTimestamp(value, fieldName) {
  const text = cleanText(value);
  if (!isValidTimestamp(text)) {
    throw businessError(400, "ATTENDANCE_SYNC_TIMESTAMP_INVALID", `${fieldName} 不是有效时间。`);
  }
  return new Date(text).toISOString();
}

function normalizeSourceLocalDate(value, punchedAt) {
  const text = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(punchedAt));
}

function formatLocalTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function nonNegativeInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw businessError(400, "ATTENDANCE_REVIEW_MINUTES_INVALID", `${fieldName} 必须是非负整数。`);
  }
  return number;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function isValidTimestamp(value) {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function isValidDateOnly(value) {
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function uniqueTextList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanText).filter(Boolean))];
}

function businessError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

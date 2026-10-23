import { mergeRuntimeIdentityStateIntoWorkspace, normalizeRuntimeIdentityStateFromWorkspace } from "../runtimeIdentityRepository.mjs";

const identityMutations = new WeakMap();

export function findRuntimeUserById(workspace, userId) {
  const safeUserId = cleanText(userId);
  if (!safeUserId) return null;
  return runtimeUsers(workspace).find(
    (user) =>
      cleanText(user?.userId ?? user?.id) === safeUserId &&
      isFormalRuntimeUserSource(user?.source),
  ) ?? null;
}

export function findRuntimeUserByIdentifiers(workspace, identifiers = {}) {
  const safeLoginName = cleanText(identifiers.loginName);
  const safeUserId = cleanText(identifiers.userId);
  const safePhoneE164 = cleanText(identifiers.phoneE164 ?? identifiers.phone);
  if (!safeLoginName && !safeUserId && !safePhoneE164) return null;
  return runtimeUsers(workspace).find((user) => {
    if (!isFormalRuntimeUserSource(user?.source)) return false;
    const userId = cleanText(user?.userId ?? user?.id);
    const loginName = cleanText(user?.loginName);
    const phoneE164 = cleanText(user?.phoneE164);
    return (
      (safeUserId && userId === safeUserId) ||
      (safeLoginName && loginName === safeLoginName) ||
      (safePhoneE164 && phoneE164 === safePhoneE164)
    );
  }) ?? null;
}

export function findRuntimeUserByEmployeeId(workspace, employeeId) {
  const safeEmployeeId = cleanText(employeeId);
  if (!safeEmployeeId) return null;
  return runtimeUsers(workspace).find(
    (user) =>
      cleanText(user?.employeeId) === safeEmployeeId &&
      isFormalRuntimeUserSource(user?.source),
  ) ?? null;
}

export function upsertRuntimeUser(workspace, user) {
  const userId = cleanText(user?.userId ?? user?.id);
  if (!userId) return user;
  workspace.users = Array.isArray(workspace.users) ? workspace.users : [];
  const userIndex = workspace.users.findIndex(
    (item) => cleanText(item?.userId ?? item?.id) === userId,
  );
  if (userIndex >= 0) {
    workspace.users[userIndex] = {
      ...workspace.users[userIndex],
      ...user,
      id: userId,
      userId,
    };
    return workspace.users[userIndex];
  }
  const nextUser = {
    ...user,
    id: userId,
    userId,
  };
  workspace.users.unshift(nextUser);
  return nextUser;
}

export function nextRuntimeSessionVersion(currentVersion) {
  return (Number(currentVersion) || 0) + 1;
}

export async function persistRuntimeIdentityState(workspace, options = {}) {
  if (!workspace?.runtimeIdentityRepository?.saveState) return null;
  return await workspace.runtimeIdentityRepository.saveState({ workspace, expectedState: workspace.runtimeIdentityBaseline, ...options });
}

export function sanitizeRuntimeUserForResponse(user = {}) {
  const { seedPassword, temporaryPassword, passwordHash, invitationReferenceHash, ...safeUser } = user ?? {};
  return safeUser;
}

function runtimeUsers(workspace) {
  return Array.isArray(workspace?.users) ? workspace.users : [];
}

function isFormalRuntimeUserSource(value) {
  return ["master_data_import_review", "phone_self_registration", "subaccount_admin_created"].includes(cleanText(value));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

// Local serialization avoids needless retries; the persisted revision is the
// cross-process guard. No retry may reuse a stale security decision.
export async function runRuntimeIdentityMutation(workspace, operation) {
  const previous = identityMutations.get(workspace) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      await refreshRuntimeIdentityWorkspace(workspace);
      try { return await operation(); }
      catch (error) {
        if (error?.code !== "RUNTIME_IDENTITY_CONFLICT" || attempt === 31) throw error;
      }
    }
  });
  identityMutations.set(workspace, pending);
  try { return await pending; }
  finally { if (identityMutations.get(workspace) === pending) identityMutations.delete(workspace); }
}

export async function refreshRuntimeIdentityWorkspace(workspace) {
  if (typeof workspace?.runtimeIdentityRepository?.loadState !== "function") return;
  if (typeof workspace.runtimeIdentityRepository.getRevision === "function" &&
    await workspace.runtimeIdentityRepository.getRevision() === workspace.runtimeIdentityRevision) return;
  const state = await workspace.runtimeIdentityRepository.loadState();
  mergeRuntimeIdentityStateIntoWorkspace(workspace, state);
}

export async function commitRuntimeIdentityWorkspace(workspace, staged, options = {}) {
  try { await persistRuntimeIdentityState(staged, options); }
  catch (error) {
    if (error?.code === "RUNTIME_IDENTITY_CONFLICT") await refreshRuntimeIdentityWorkspace(workspace);
    throw error;
  }
  if ((staged.runtimeIdentityRevision ?? 0) < (workspace.runtimeIdentityRevision ?? 0)) return;
  for (const key of ["users", "employees", "operationLogs", "phoneVerificationChallenges", "revokedSeedSessionJtis", "revokedSeedSessions", "runtimeIdentityRevision"]) {
    if (Object.hasOwn(staged, key)) workspace[key] = staged[key];
  }
}

export function captureRuntimeIdentityBaseline(workspace) {
  return normalizeRuntimeIdentityStateFromWorkspace(workspace);
}

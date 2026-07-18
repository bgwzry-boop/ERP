import { useEffect, useRef } from "react";

export function shouldRefreshMasterDataOnEntry(entryRef, { activePage, authState, currentUserId }) {
  if (activePage !== "masterData") {
    entryRef.current = null;
    return false;
  }
  const previous = entryRef.current;
  if (previous?.authState === authState && previous.currentUserId === currentUserId) return false;
  entryRef.current = { authState, currentUserId };
  return true;
}

export function useOfficeMasterDataEntryRefresh({
  activePage,
  authState,
  currentUserId,
  refreshEmployeeAccountReviews,
  refreshImportReviewDrafts,
}) {
  const entryRef = useRef(null);

  useEffect(() => {
    if (!shouldRefreshMasterDataOnEntry(entryRef, { activePage, authState, currentUserId })) return;
    void Promise.allSettled([
      refreshImportReviewDrafts({ silent: true }),
      refreshEmployeeAccountReviews({ silent: true }),
    ]);
  }, [activePage, authState, currentUserId, refreshEmployeeAccountReviews, refreshImportReviewDrafts]);
}

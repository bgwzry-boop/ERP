// A persisted revision is the ordering authority for versioned business rows.
// Timestamps only break ties (or order rows without revisions, such as todos).
export function acceptsWorkspaceRecordVersion(existing, current) {
  if (!existing) return true;
  const previousRevision = Number(existing.revision), currentRevision = Number(current.revision);
  if (Number.isInteger(previousRevision) && previousRevision > 0
    && Number.isInteger(currentRevision) && currentRevision > 0
    && previousRevision !== currentRevision) return currentRevision > previousRevision;
  return !(Date.parse(existing.updatedAt) > Date.parse(current.updatedAt));
}

// An action receipt may be historical. Merge only its target, without rolling
// back a newer current version or overwriting another concurrently saved receipt.
export function mergeRawMaterialCurrentInbound(current = [], incoming) {
  if (!incoming?.id) return current;
  let found = false;
  const result = current.map(item => {
    if (item.id !== incoming.id) return item;
    found = true;
    return Number(item.revision || 0) > Number(incoming.revision || 0) ? item : incoming;
  });
  return found ? result : [incoming, ...result];
}

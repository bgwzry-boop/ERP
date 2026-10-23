// Called only after the repository's shared source-return transaction lock.
// Aggregate current persisted reservations, never the pre-transaction workspace.
export function buildSupplierReturnTransactionGuard(parameters, constraint) {
  if (!constraint) return "";
  const sourceId = parameters.text(constraint.sourceReturnInboundId);
  const sourceRevision = parameters.integer(constraint.sourceRevision);
  const weightKg = parameters.number(constraint.weightKg);
  return `supplier_return_source AS MATERIALIZED (
    SELECT payload_json, revision FROM raw_material_inbounds WHERE id = ${sourceId} FOR UPDATE
  ), supplier_return_usage AS MATERIALIZED (
    SELECT COUNT(*) AS roll_count, COALESCE(SUM(ABS(COALESCE(NULLIF(record->>'weightKg', '')::numeric, 0))), 0) AS weight_kg
    FROM raw_material_inbounds AS inbound
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(inbound.payload_json->'rawMaterialSupplierReturnRecords', '[]'::jsonb)) AS record
    WHERE record->>'sourceReturnInboundId' = ${sourceId} AND COALESCE(record->>'status', '') <> '已取消'
  ), supplier_return_guard AS MATERIALIZED (
    SELECT erp_require(EXISTS (
      SELECT 1 FROM supplier_return_source AS source, supplier_return_usage AS used
      WHERE source.revision = ${sourceRevision}
        AND source.payload_json->>'documentDirection' = 'supplier_return'
        AND source.payload_json->>'status' = '退货单已复核'
        AND (ABS(COALESCE(NULLIF(source.payload_json->>'rollCount', '')::numeric, 0)) = 0
          OR used.roll_count + 1 <= ABS((source.payload_json->>'rollCount')::numeric))
        AND (ABS(COALESCE(NULLIF(source.payload_json->>'totalWeightKg', '')::numeric, 0)) = 0
          OR used.weight_kg + ${weightKg} <= ABS((source.payload_json->>'totalWeightKg')::numeric)
            + GREATEST(0.5, ABS((source.payload_json->>'totalWeightKg')::numeric) * 0.01))
    ), 'ERP_RAW_MATERIAL_SUPPLIER_RETURN_SCOPE_CONFLICT') AS ok
  ),`;
}

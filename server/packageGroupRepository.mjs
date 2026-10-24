import { orderTypeAliasesFor } from "../shared/orderRouting.js";
import { packageGroupLoadSnapshot } from "./services/packageGroupLoadService.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "./coreWorkspaceReadRepository.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { buildPostgresIdempotencyRequest, buildIdempotencyRequestHash, buildIdempotencyConflictError, normalizeIdempotencyKey } from "./idempotency.mjs";
import { packageGroupSnapshot, hasPackageDownstream } from "./services/packageGroupService.mjs";
import { fulfillmentIdOf, packageIdOf, packageContents, isActivePackage } from "../shared/packageContents.js";

const clone = value => structuredClone(value);
const conflict = () => { throw Object.assign(new Error("订单、包裹、调度或下游事实已变化，请刷新核对。"), { statusCode: 409, code: "PACKING_GROUP_CHANGED" }); };
const lineId = row => row.orderLineId ?? row.lineId ?? row.id;
function response(input) {
  const quantityDifferences = input.snapshot.fulfillments.flatMap(f => {
    const source = input.workspace.fulfillments.find(row => fulfillmentIdOf(row)===f.id);
    const expectedQty = Number(source.expectedQty ?? source.qty);
    return input.totals[f.id] === expectedQty ? [] : [{ fulfillmentId:f.id, expectedQty, actualQty:input.totals[f.id],exceptionId:`EX-PKG-${input.operationLogId}-${f.id}`,todoId:`T-PKG-DIFF-${input.operationLogId}-${f.id}` }];
  });
  return { anchorFulfillmentId: input.anchorId, packingRevision: input.packingRevision, packageIds: input.packages.map(packageIdOf), packages: input.packages,
    fulfillmentIds: input.snapshot.fulfillments.map(row=>row.id), quantityDifferences, operationLogId: input.operationLogId, inventoryDeducted:false };
}
export function createPackageGroupRepository({ queryJson, idempotentTransactionJson } = {}) {
  const receipts = new Map();
  const postgres = Boolean(idempotentTransactionJson);
  const scope = action => `packing.group.${action}`;
  async function replay({ action, payload, idempotencyKey }) {
    const key = normalizeIdempotencyKey(idempotencyKey);
    if (!key) return null;
    const prior = postgres
      ? await queryJson("SELECT json_build_object('requestHash',request_hash,'response',response_json) AS result FROM operation_idempotency_keys WHERE scope=$1 AND idempotency_key=$2",[scope(action),key])
      : receipts.get(`${scope(action)}:${key}`);
    if (!prior) return null;
    if (prior.requestHash !== buildIdempotencyRequestHash(payload)) throw buildIdempotencyConflictError();
    return clone(prior.response);
  }
  async function refresh({workspace}) {
    if (!postgres) return workspace;
    const current=await createPostgresCoreWorkspaceReadRepository({queryJson}).loadState();
    for(const key of ["customers","fulfillments","packages","orderLines","packingTasks","printRecords","paperOutboundDocuments","todos","operationLogs","fulfillmentExceptions","fulfillmentQuantityVarianceResolutions"]) workspace[key]=current[key];
    const rows=await queryJson("SELECT COALESCE(json_agg(to_jsonb(d)), '[]'::json) AS result FROM driver_delivery_dispatches d");
    workspace.driverDeliveryDispatches=(rows??[]).map(d=>({id:d.id,dispatchId:d.id,fulfillmentId:d.fulfillment_id,driverId:d.driver_id,routeDate:String(d.route_date??'').slice(0,10),routeNo:d.route_batch_no,dispatchStatus:d.dispatch_status,revision:d.revision,assignedAt:d.assigned_at,stopSequence:d.stop_sequence}));
    return workspace;
  }
  return {
    refreshPackageGroupWorkspace: refresh,
    findPackageGroupReplay: replay,
    async writePackageGroupLoad(input) {
      if (!normalizeIdempotencyKey(input.idempotencyKey)) throw Object.assign(new Error("缺少确认标识"),{statusCode:422,code:"IDEMPOTENCY_KEY_REQUIRED"});
      const prior=await replay(input);if(prior)return prior;
      const result={fulfillmentId:input.anchorId,anchorFulfillmentId:input.anchorId,fulfillmentIds:input.snapshot.fulfillments.map(f=>f.id),checkedPackageIds:input.checkedPackageIds,
        status:"配送中",loadedAt:input.loadedAt,operationLogId:input.operationLogId};
      if (postgres) {
        const saved=await idempotentTransactionJson(buildPostgresIdempotencyRequest({scope:scope('load'),idempotencyKey:input.idempotencyKey,payload:input.payload,operatorId:input.operatorId,targetType:"fulfillment",targetId:input.anchorId,
          resourceLocks:result.fulfillmentIds.map(id=>`fulfillment:${id}`),query:buildPackageGroupLoadQuery(input,result)}));
        const current=await createPostgresCoreWorkspaceReadRepository({queryJson}).loadState();input.workspace.fulfillments=current.fulfillments;input.workspace.operationLogs=current.operationLogs;return saved;
      }
      if(JSON.stringify(packageGroupLoadSnapshot(input.workspace,input.anchorId))!==JSON.stringify(input.snapshot))conflict();
      input.workspace.fulfillments=input.workspace.fulfillments.map(f=>result.fulfillmentIds.includes(fulfillmentIdOf(f))?{...f,status:"配送中",driverStatus:"配送中",loadedAt:input.loadedAt,loadedBy:input.operatorId,driverId:input.operatorId,revision:Number(f.revision??1)+1}:f);
      input.workspace.operationLogs=[{id:input.operationLogId,targetType:"fulfillment",targetId:input.anchorId,action:"driver_load_package_group",before:input.snapshot,after:result,operatorId:input.operatorId,occurredAt:input.loadedAt},...(input.workspace.operationLogs??[])];
      receipts.set(`${scope('load')}:${input.idempotencyKey}`,{requestHash:buildIdempotencyRequestHash(input.payload),response:clone(result)});return result;
    },
    async writePackageGroup(input) {
      if (!normalizeIdempotencyKey(input.idempotencyKey)) throw Object.assign(new Error("缺少本次确认标识，请重新核对。"),{statusCode:422,code:"IDEMPOTENCY_KEY_REQUIRED"});
      const prior = await replay(input); if (prior) return prior;
      const result = response(input);
      if (postgres) {
        const query = buildReplacePackageGroupQuery(input,result);
        const saved = await idempotentTransactionJson(buildPostgresIdempotencyRequest({ scope:scope(input.action),idempotencyKey:input.idempotencyKey,payload:input.payload,
          operatorId:input.operatorId,targetType:"fulfillment",targetId:input.anchorId,
          resourceLocks:[`packing-order:${input.orderId}`,...input.snapshot.fulfillments.map(row=>`fulfillment:${row.id}`),...input.snapshot.lines.map(row=>`order-line:${row.id}`)],query }));
        const current = await createPostgresCoreWorkspaceReadRepository({queryJson}).loadState();
        for (const key of ["fulfillments","packages","orderLines","packingTasks","printRecords","paperOutboundDocuments","todos","operationLogs","fulfillmentExceptions"]) input.workspace[key]=current[key];
        return saved;
      }
      const ids = new Set(input.snapshot.fulfillments.map(row=>row.id));
      const current = input.workspace.fulfillments.filter(row=>ids.has(fulfillmentIdOf(row)));
      const packages = input.workspace.packages.filter(row=>isActivePackage(row)&&packageContents(row).some(item=>ids.has(item.fulfillmentId)));
      if (current.some(hasPackageDownstream) || JSON.stringify(packageGroupSnapshot(input.workspace,current,packages))!==JSON.stringify(input.snapshot)) conflict();
      const workspace=input.workspace, batch=`${input.anchorId}-R${input.packingRevision}`;
      workspace.packages=workspace.packages.map(row=>packages.some(p=>packageIdOf(p)===packageIdOf(row))?{...row,status:"已失效",supersededByBatchId:batch,revision:Number(row.revision??1)+1}:row).concat(clone(input.packages));
      workspace.fulfillments=workspace.fulfillments.map(row=>ids.has(fulfillmentIdOf(row))?{...row,actualQty:input.totals[fulfillmentIdOf(row)],status:result.quantityDifferences.some(diff=>diff.fulfillmentId===fulfillmentIdOf(row))?"数量差异待处理":"待打印标签",
        packingGroupAnchorId:input.anchorId,packingGroupRevision:input.packingRevision,paperOutboundDocumentId:"",paperOutboundStatus:"待生成纸单",revision:Number(row.revision??1)+1}:row);
      workspace.orderLines=workspace.orderLines.map(row=>input.snapshot.lines.some(line=>line.id===lineId(row))?{...row,status:"待打印标签",lineStatus:"待打印标签",revision:Number(row.revision??1)+1}:row);
      for (const f of current) {
        const task=(workspace.packingTasks??[]).find(row=>lineId(row)===lineId(f));
        const next={...task,id:task?.id??`PKT-F-${fulfillmentIdOf(f)}`,packingTaskId:task?.packingTaskId??task?.id??`PKT-F-${fulfillmentIdOf(f)}`,orderLineId:lineId(f),plannedQty:Number(f.expectedQty??f.qty),actualPackedQty:input.totals[fulfillmentIdOf(f)],status:"已完成",revision:Number(task?.revision??0)+1,createdBy:input.operatorId};
        workspace.packingTasks=[...(workspace.packingTasks??[]).filter(row=>lineId(row)!==lineId(f)),next];
      }
      const printIds=new Set((workspace.printRecords??[]).filter(row=>row.targetType==="fulfillment"&&ids.has(row.targetId)&&row.status!=="voided").map(row=>row.printRecordId??row.id));
      workspace.printRecords=(workspace.printRecords??[]).map(row=>printIds.has(row.printRecordId??row.id)?{...row,status:"voided",voidReason:input.reason,voidedBy:input.operatorId,voidedAt:input.occurredAt,revision:Number(row.revision??1)+1}:row);
      workspace.printJobs=(workspace.printJobs??[]).map(row=>printIds.has(row.printRecordId)?{...row,jobStatus:"canceled",revision:Number(row.revision??1)+1}:row);
      workspace.paperOutboundDocuments=(workspace.paperOutboundDocuments??[]).map(row=>ids.has(row.fulfillmentId)?{...row,status:"已作废",revision:Number(row.revision??1)+1}:row);
      workspace.fulfillmentExceptions=(workspace.fulfillmentExceptions??[]).map(e=>ids.has(e.fulfillmentId)&&e.reasonCode==="packing_physical_difference"&&!["已作废","已解决"].includes(e.status)?{...e,status:"已作废"}:e);
      workspace.todos=(workspace.todos??[]).map(t=>ids.has(t.refId??t.ref)&&(t.type==="待打印标签"||t.type==="数量差异待处理"&&(workspace.fulfillmentExceptions??[]).some(e=>e.todoId===t.id&&e.reasonCode==="packing_physical_difference"))&&t.status!=="已处理"?{...t,status:"已处理",handled:true,handledBy:input.operatorId,handledAt:input.occurredAt,handlingResult:"包组更正后已建立当前版待办"}:t);
      for(const diff of result.quantityDifferences){workspace.fulfillmentExceptions.push({id:diff.exceptionId,exceptionId:diff.exceptionId,fulfillmentId:diff.fulfillmentId,exceptionType:"quantity_mismatch",expectedQty:diff.expectedQty,actualQty:diff.actualQty,reasonCode:"packing_physical_difference",reason:input.reason,status:"待办公室处理",todoId:diff.todoId,reportedBy:input.operatorId,occurredAt:input.occurredAt});workspace.todos.push({id:diff.todoId,bizNo:diff.todoId,type:"数量差异待处理",refType:"fulfillment",refId:diff.fulfillmentId,status:"未处理",summary:"实物打包数量与本次计划不同，请核对后按有权限的数量差异流程处理",createdBy:input.operatorId,createdAt:input.occurredAt});}
      const todo={id:`T-PKG-${input.operationLogId}`,type:"待打印标签",refType:"fulfillment",refId:input.anchorId,ref:input.anchorId,status:"未处理",customerId:current[0]?.customerId,summary:`实物包组 ${input.packages.length} 包；${result.quantityDifferences.length?"数量差异待办公室核对":"等待可信打印挂牌"}`,createdBy:input.operatorId,createdAt:input.occurredAt};
      workspace.todos=[todo,...(workspace.todos??[])];
      workspace.operationLogs=[{id:input.operationLogId,targetType:"fulfillment",targetId:input.anchorId,action:"replace_package_group",before:clone(input.snapshot),after:clone(result),reason:input.reason,operatorId:input.operatorId,occurredAt:input.occurredAt},...(workspace.operationLogs??[])];
      receipts.set(`${scope(input.action)}:${input.idempotencyKey}`,{requestHash:buildIdempotencyRequestHash(input.payload),response:clone(result)});
      return result;
    },
  };
}

export function buildReplacePackageGroupQuery(input, result) {
  const p=createPostgresParameterBinder(), ids=input.snapshot.fulfillments.map(row=>row.id), lineIds=input.snapshot.lines.map(row=>row.id);
  const idParam=p.textArray(ids), lineParam=p.textArray(lineIds), operator=p.text(input.operatorId), anchor=p.text(input.anchorId), now=p.timestamp(input.occurredAt), log=p.text(input.operationLogId);
  const totals=p.json(input.totals), batch=p.text(`${input.anchorId}-R${input.packingRevision}`), reason=p.text(input.reason), packRevision=p.integer(input.packingRevision);
  const snapshot=input.snapshot;
  return { text:`WITH
locked_f AS MATERIALIZED (SELECT * FROM fulfillment_records WHERE id=ANY(${idParam}) ORDER BY id FOR UPDATE),
locked_l AS MATERIALIZED (SELECT * FROM order_lines WHERE id=ANY(${lineParam}) ORDER BY id FOR UPDATE),
locked_t AS MATERIALIZED (SELECT * FROM packing_tasks WHERE order_line_id=ANY(${lineParam}) ORDER BY id FOR UPDATE),
locked_p AS MATERIALIZED (SELECT * FROM packages WHERE status NOT IN ('已作废','已失效','voided','invalidated')
  AND (fulfillment_id=ANY(${idParam}) OR EXISTS(SELECT 1 FROM jsonb_array_elements(contents_json) i WHERE i->>'fulfillmentId'=ANY(${idParam}))) ORDER BY id FOR UPDATE),
locked_print AS MATERIALIZED (SELECT * FROM print_records WHERE target_type='fulfillment' AND target_id=ANY(${idParam}) AND status<>'voided' ORDER BY id FOR UPDATE),
locked_paper AS MATERIALIZED (SELECT * FROM paper_outbound_documents WHERE fulfillment_id=ANY(${idParam}) AND status<>'已作废' ORDER BY id FOR UPDATE),
locked_job AS MATERIALIZED (SELECT * FROM print_jobs WHERE print_record_id IN(SELECT id FROM locked_print) ORDER BY id FOR UPDATE),
guard AS MATERIALIZED (SELECT erp_require(
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'orderLineId',order_line_id,'actualQty',actual_qty,'status',status,
    'physicalOutbound',physical_outbound_at IS NOT NULL,'loaded',loaded_at IS NOT NULL,'delivered',delivered_at IS NOT NULL,'finalDelivered',final_delivery_at IS NOT NULL,
    'packingGroupAnchorId',packing_group_anchor_id,'packingGroupRevision',packing_group_revision) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM locked_f)=${p.json(snapshot.fulfillments)}
  AND NOT EXISTS(SELECT 1 FROM locked_f WHERE physical_outbound_at IS NOT NULL OR loaded_at IS NOT NULL OR final_delivery_at IS NOT NULL OR delivered_at IS NOT NULL OR status IN('已交付','已完成','已出库','已拉走','已取消','已作废','配送中'))
  AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'orderId',order_id,'status',line_status,'qty',original_qty) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM locked_l)=${p.json(snapshot.lines)}
  AND NOT EXISTS(SELECT 1 FROM locked_l WHERE line_status IN ('已作废','已取消','已交付','已完成','closed','voided','canceled'))
  AND NOT EXISTS(SELECT 1 FROM locked_t WHERE status IN ('已作废','已取消','closed','voided','canceled'))
  AND NOT EXISTS(SELECT 1 FROM locked_l l WHERE NOT EXISTS(SELECT 1 FROM locked_t t WHERE t.order_line_id=l.id) AND (l.order_type<>ALL(${p.textArray([...orderTypeAliasesFor('stock'),...orderTypeAliasesFor('stock_printed')])}) OR l.line_status IN ('待排产','待生产','待确认')))
  AND (SELECT COUNT(DISTINCT order_id) FROM locked_l)=1 AND (SELECT min(order_id) FROM locked_l)=${p.text(input.orderId)}
  AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'status',status,'orderLineId',order_line_id) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM locked_t)=${p.json(snapshot.tasks)}
  AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'status',status,'packedQty',packed_qty,'labelPrintRecordId',COALESCE(label_print_record_id,''),
    'contents',CASE WHEN jsonb_array_length(contents_json)>0 THEN contents_json ELSE jsonb_build_array(jsonb_build_object('orderLineId',order_line_id,'fulfillmentId',COALESCE(fulfillment_id,''),'packedQty',packed_qty)) END) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM locked_p)=${p.json(snapshot.packages)}, 'ERP_PACKING_GROUP_CONCURRENCY_CONFLICT') AS ok),
invalidated_p AS (UPDATE packages SET status='已失效',superseded_by_batch_id=${batch},revision=packages.revision+1,updated_at=${now} FROM locked_p,guard WHERE packages.id=locked_p.id AND guard.ok RETURNING packages.id),
invalidated_print AS (UPDATE print_records SET status='voided',void_reason=${reason} FROM locked_print,guard WHERE print_records.id=locked_print.id AND guard.ok RETURNING print_records.id),
invalidated_paper AS (UPDATE paper_outbound_documents SET status='已作废',revision=paper_outbound_documents.revision+1,updated_at=${now} FROM locked_paper,guard WHERE paper_outbound_documents.id=locked_paper.id AND guard.ok RETURNING paper_outbound_documents.id),
canceled_jobs AS (UPDATE print_jobs SET job_status='canceled',updated_at=${now} FROM locked_job,guard WHERE print_jobs.id=locked_job.id AND guard.ok RETURNING print_jobs.id),
new_packages AS (INSERT INTO packages(id,biz_no,order_line_id,fulfillment_id,package_seq,package_count,packed_qty,contents_json,packing_revision,label_print_record_id,status,created_by,revision,created_at,updated_at)
  SELECT r.id,r.id,r.line_id,${anchor},r.seq,r.count,r.qty,r.contents,${packRevision},NULL,'待打印标签',${operator},1,${now},${now}
  FROM jsonb_to_recordset(${p.json(input.packages.map(row=>({id:row.packageId,line_id:row.orderLineId,seq:row.packageSeq,count:row.packageCount,qty:row.packedQty,contents:row.contents})) )}) AS r(id text,line_id text,seq integer,count integer,qty integer,contents jsonb),guard WHERE guard.ok RETURNING id),
updated_f AS (UPDATE fulfillment_records SET actual_qty=(${totals}->>fulfillment_records.id)::int,
  status=CASE WHEN (${totals}->>fulfillment_records.id)::int=fulfillment_records.expected_qty THEN '待打印标签' ELSE '数量差异待处理' END,
  packing_group_anchor_id=${anchor},packing_group_revision=${packRevision},paper_outbound_document_id='',paper_outbound_status='待生成纸单',revision=fulfillment_records.revision+1,updated_at=${now}
  FROM guard WHERE id=ANY(${idParam}) AND guard.ok RETURNING id),
updated_l AS (UPDATE order_lines SET line_status='待打印标签',revision=revision+1,updated_at=${now} FROM guard WHERE id=ANY(${lineParam}) AND guard.ok RETURNING id),
updated_t AS (UPDATE packing_tasks SET actual_packed_qty=(${totals}->>(SELECT id FROM locked_f WHERE order_line_id=packing_tasks.order_line_id))::int,status='已完成',revision=packing_tasks.revision+1,updated_at=${now} FROM guard WHERE order_line_id=ANY(${lineParam}) AND guard.ok RETURNING id),
created_t AS (INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,actual_packed_qty,status,created_by,revision,created_at,updated_at)
  SELECT 'PKT-F-'||f.id,'PKT-F-'||f.id,f.order_line_id,f.expected_qty,(${totals}->>f.id)::int,'已完成',${operator},1,${now},${now} FROM locked_f f,guard
  WHERE NOT EXISTS(SELECT 1 FROM locked_t t WHERE t.order_line_id=f.order_line_id) AND guard.ok RETURNING id),
closed_packing_exceptions AS (UPDATE fulfillment_exceptions SET status='已作废',updated_at=${now} FROM guard WHERE fulfillment_id=ANY(${idParam}) AND reason_code='packing_physical_difference' AND status NOT IN('已作废','已解决') AND guard.ok RETURNING id),
closed_packing_todos AS (UPDATE todos SET status='已处理',handled_by=${operator},handled_at=${now},handling_result='包组更正后已建立当前版待办',updated_at=${now} FROM guard WHERE ref_type='fulfillment' AND ref_id=ANY(${idParam}) AND (type='待打印标签' OR type='数量差异待处理' AND id IN(SELECT todo_id FROM fulfillment_exceptions WHERE reason_code='packing_physical_difference' AND fulfillment_id=ANY(${idParam}))) AND status<>'已处理' AND guard.ok RETURNING id),
new_quantity_todos AS (INSERT INTO todos(id,biz_no,type,ref_type,ref_id,status,summary,created_by,created_at,updated_at)
 SELECT d.todo_id,d.todo_id,'数量差异待处理','fulfillment',d.fulfillment_id,'未处理','实物打包数量与本次计划不同，请核对后按有权限的数量差异流程处理',${operator},${now},${now}
 FROM jsonb_to_recordset(${p.json(result.quantityDifferences.map(d=>({todo_id:d.todoId,fulfillment_id:d.fulfillmentId})))}) AS d(todo_id text,fulfillment_id text),guard WHERE guard.ok RETURNING id),
new_quantity_exceptions AS (INSERT INTO fulfillment_exceptions(id,fulfillment_id,exception_type,expected_qty,actual_qty,reason_code,reason,status,todo_id,reported_by,occurred_at,created_at,updated_at)
 SELECT d.id,d.fulfillment_id,'quantity_mismatch',d.expected_qty,d.actual_qty,'packing_physical_difference',${reason},'待办公室处理',d.todo_id,${operator},${now},${now},${now}
 FROM jsonb_to_recordset(${p.json(result.quantityDifferences.map(d=>({id:d.exceptionId,todo_id:d.todoId,fulfillment_id:d.fulfillmentId,expected_qty:d.expectedQty,actual_qty:d.actualQty})))}) AS d(id text,todo_id text,fulfillment_id text,expected_qty int,actual_qty int),guard WHERE guard.ok RETURNING id),
new_todo AS (INSERT INTO todos(id,biz_no,type,ref_type,ref_id,status,summary,created_by,created_at,updated_at)
  SELECT ${p.text(`T-PKG-${input.operationLogId}`)},${p.text(`T-PKG-${input.operationLogId}`)},'待打印标签','fulfillment',${anchor},'未处理',${p.text(result.quantityDifferences.length?'实物包组数量差异，请办公室核对':'实物包组等待可信打印挂牌')},${operator},${now},${now} FROM locked_f f,guard WHERE f.id=${anchor} AND guard.ok RETURNING id),
audit AS (INSERT INTO operation_logs(id,target_type,target_id,action,before_json,after_json,reason,operator_id,occurred_at,created_at)
 SELECT ${log},'fulfillment',${anchor},'replace_package_group',${p.json(snapshot)},${p.json(result)},${reason},${operator},${now},${now} FROM guard WHERE guard.ok RETURNING id)
SELECT ${p.json(result)} AS result FROM guard WHERE ok AND erp_require((SELECT count(*) FROM new_packages)=${p.integer(input.packages.length)} AND (SELECT count(*) FROM updated_f)=${p.integer(ids.length)} AND (SELECT count(*) FROM audit)=1 AND (SELECT count(*) FROM new_quantity_exceptions)=${p.integer(result.quantityDifferences.length)},'ERP_PACKING_GROUP_WRITE_INCOMPLETE')`, values:p.values };
}

export function buildPackageGroupLoadQuery(input,result) {
 const p=createPostgresParameterBinder(),anchor=p.text(input.anchorId),ids=p.textArray(result.fulfillmentIds),now=p.timestamp(input.loadedAt),op=p.text(input.operatorId);
 return {text:`WITH locked_f AS MATERIALIZED (SELECT * FROM fulfillment_records WHERE packing_group_anchor_id=${anchor} ORDER BY id FOR UPDATE),
 locked_d AS MATERIALIZED (SELECT * FROM driver_delivery_dispatches WHERE fulfillment_id=ANY(${ids}) AND dispatch_status NOT IN ('已取消','canceled','voided') ORDER BY id FOR UPDATE),
 locked_p AS MATERIALIZED (SELECT * FROM packages WHERE fulfillment_id=${anchor} AND status NOT IN ('已作废','已失效','voided','invalidated') ORDER BY id FOR UPDATE),
 locked_print AS MATERIALIZED (SELECT * FROM print_records WHERE id IN(SELECT label_print_record_id FROM locked_p) ORDER BY id FOR SHARE),
 guard AS MATERIALIZED (SELECT erp_require(
 (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'status',status,'physicalOutboundAt',CASE WHEN physical_outbound_at IS NULL THEN NULL ELSE to_char(physical_outbound_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,'loadedAt',CASE WHEN loaded_at IS NULL THEN NULL ELSE to_char(loaded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,'packingGroupRevision',packing_group_revision) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM locked_f)=${p.json(input.snapshot.fulfillments)}
 AND NOT EXISTS(SELECT 1 FROM locked_f WHERE method<>'送货' OR physical_outbound_at IS NULL OR physical_outbound_at>${now} OR loaded_at IS NOT NULL OR delivered_at IS NOT NULL OR final_delivery_at IS NOT NULL OR status IN ('已交付','已作废','已取消','送货异常','数量差异待处理'))
 AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'fulfillmentId',fulfillment_id,'driverId',driver_id,'routeDate',route_date::text,'routeNo',route_batch_no,'status',dispatch_status) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM locked_d)=${p.json(input.snapshot.dispatches)}
 AND (SELECT count(*) FROM locked_d)=(SELECT count(*) FROM locked_f) AND NOT EXISTS(SELECT 1 FROM locked_d WHERE driver_id<>${op} OR route_batch_no='') AND (SELECT count(DISTINCT (route_date,route_batch_no)) FROM locked_d)=1
 AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'status',status,'labelPrintRecordId',COALESCE(label_print_record_id,'')) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM locked_p)=${p.json(input.snapshot.packages)}
 AND NOT EXISTS(SELECT 1 FROM locked_p p WHERE p.status<>'已打印标签' OR NOT EXISTS(SELECT 1 FROM locked_print r WHERE r.id=p.label_print_record_id AND r.status IN ('printed','reprinted')))
 AND NOT EXISTS(SELECT 1 FROM locked_f f WHERE f.actual_qty IS DISTINCT FROM (SELECT sum((item->>'packedQty')::bigint) FROM locked_p p CROSS JOIN LATERAL jsonb_array_elements(p.contents_json) item WHERE item->>'fulfillmentId'=f.id))
 AND (SELECT count(*) FROM locked_p)>0,'ERP_PACKING_GROUP_LOAD_CONFLICT') AS ok),
 updated_f AS (UPDATE fulfillment_records SET status='配送中',loaded_by=${op},loaded_at=${now},revision=fulfillment_records.revision+1,updated_at=${now} FROM guard WHERE packing_group_anchor_id=${anchor} AND guard.ok RETURNING id),
 audit AS (INSERT INTO operation_logs(id,target_type,target_id,action,before_json,after_json,reason,operator_id,occurred_at,created_at) SELECT ${p.text(input.operationLogId)},'fulfillment',${anchor},'driver_load_package_group',${p.json(input.snapshot)},${p.json(result)},${p.text(input.reason)},${op},${now},${now} FROM guard WHERE ok RETURNING id)
 SELECT ${p.json(result)} AS result FROM guard WHERE ok AND erp_require((SELECT count(*) FROM updated_f)=${p.integer(result.fulfillmentIds.length)} AND (SELECT count(*) FROM audit)=1,'ERP_PACKING_GROUP_LOAD_INCOMPLETE')`,values:p.values};
}

import { getVisiblePcNavGroups } from './navigation.js';

const targets = Object.freeze({
  order_draft: 'order-entry',
  order_line: 'order-pool',
  fulfillment: 'outbound-delivery',
  statement: 'customer-statements',
  production_task: 'production-tasks',
  maintenance_task: 'maintenance-tasks',
});

export function resolveTodoWorkspaceLink(todo, permissionContext) {
  const blocked = (reason) => ({ navId: '', label: '打开关联工作台', reason, disabled: true });
  if (!todo) return blocked('请先选择一条待办。');
  if (todo.referenceStatus !== 'valid') {
    return blocked(String(todo.referenceReason || '').trim() || '业务引用尚未核实或已失效，请先核对待办引用。');
  }
  if (!String(todo.resolvedRefId || '').trim()) return blocked('引用缺少明确业务编号，请先核对待办引用。');
  const retake = todo.type === '成品图需重拍';
  if (retake && (todo.productionTaskReferenceStatus !== 'valid' || !String(todo.productionTaskId || '').trim())) {
    return blocked('重拍任务归属缺失或冲突，请刷新并核对来源。');
  }
  const navId = retake ? 'production-tasks' : targets[todo.resolvedRefType];
  if (!navId) return blocked('该引用类型尚未配置跳转，请在对应业务中核查。');
  const item = getVisiblePcNavGroups(permissionContext).flatMap(group => group.items).find(item => item.id === navId);
  if (!item) return blocked('当前账号无权进入关联工作台，请联系有权限的同事处理。');
  if (retake) return {
    navId, label: '打开重拍生产任务', reason: '', disabled: false,
    productionTaskId: String(todo.productionTaskId).trim(),
  };
  if (todo.resolvedRefType === 'maintenance_task') return { navId, label: '打开设备任务', reason: '', disabled: false, maintenanceTaskId: String(todo.resolvedRefId).trim() };
  if (todo.resolvedRefType === 'fulfillment') return {
    navId, label: `打开${item.label}记录`, reason: '', disabled: false,
    fulfillmentId: String(todo.resolvedRefId).trim(),
  };
  return { navId, label: `打开${item.label}列表`, reason: '', disabled: false };
}

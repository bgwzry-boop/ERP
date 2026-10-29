import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrderProgress, ORDER_PROGRESS_STEPS } from '../src/orderProgress.js';

test('order statuses map to the 下单 → 生产 → 出库 → 对账 stage and the matching workbench', () => {
  assert.deepEqual(ORDER_PROGRESS_STEPS, ['下单', '生产', '出库', '对账']);
  const cases = [
    ['缺货待处理', 0, 'production-tasks'],
    ['丝印中', 1, 'production-tasks'],
    ['制袋中', 1, 'production-tasks'],
    ['待打包', 1, 'production-tasks'],
    ['已备货', 2, 'outbound-delivery'],
    ['待出库', 2, 'outbound-delivery'],
    ['待送货', 2, 'outbound-delivery'],
    ['已交付', 3, 'customer-statements'],
    ['待对账', 3, 'customer-statements'],
    ['待收款确认', 3, 'customer-statements'],
  ];
  for (const [status, stage, target] of cases) {
    const progress = getOrderProgress(status);
    assert.equal(progress.stage, stage, status);
    assert.equal(progress.target, target, status);
    assert.ok(progress.next.length > 0, status);
  }
});

test('steps mark done / current / todo around the current stage', () => {
  assert.deepEqual(getOrderProgress('待出库').steps.map((step) => step.state), ['done', 'done', 'current', 'todo']);
  assert.deepEqual(getOrderProgress('丝印中').steps.map((step) => step.state), ['done', 'current', 'todo', 'todo']);
});

test('the previous primary-button routing is preserved for production and outbound statuses', () => {
  // 改版前：待出库 / 已备货 → 出库交付，其余 → 生产任务
  assert.equal(getOrderProgress('待出库').action, '进入出库交付');
  assert.equal(getOrderProgress('已备货').action, '进入出库交付');
  assert.equal(getOrderProgress('制袋中').action, '进入生产任务');
});

test('unknown or empty status shows no stage and keeps the safe production default', () => {
  for (const status of ['', null, '某个新状态']) {
    const progress = getOrderProgress(status);
    assert.equal(progress.stage, null);
    assert.equal(progress.target, 'production-tasks');
    assert.ok(progress.steps.every((step) => step.state === 'todo'));
  }
});

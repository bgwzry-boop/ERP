# ERP 单一版本与受控发布规则

## 目标

项目只有一条可部署版本线。Codex 对话只是修改任务，不是版本来源，也不能各自发布一个“当前版”。评估站、测试环境和腾讯云都必须能回答同一组问题：来自哪个完整 Git 提交、使用哪把发布锁、部署到哪个目标、部署后实际运行的是否仍是这一版。

## 一、对话与代码隔离

1. 每个修改任务只在自己的 Git 分支和 worktree 中工作。
2. 共享脏工作区只能用于开发与本地预览，禁止直接部署。
3. 多个任务的成果由一个明确的集成/发布任务合并、复核和生成候选提交。
4. 评估站不是第二套源码；它和腾讯云只是同一提交在不同目标的部署实例。
5. 未提交、未推送、没有上游分支、使用短提交号或提交不一致时，发布锁一律不能生成。

## 二、生成发布锁

候选分支必须已经提交、推送并与上游完全一致。使用完整 40 位提交号：

```bash
npm run controlled-release:prepare -- \
  --target review-site \
  --expected-commit <full-40-character-commit> \
  --version review-<date>-r<n> \
  --output .erp-local-storage/releases/review-site.lock.json
```

目标只能是：

- `review-site`：评估预览站；
- `staging`：正式测试环境；
- `tencent-production`：腾讯云生产环境。

发布锁记录完整提交、目标、版本、分支、上游、生成时间，并用 SHA-256 摘要防止锁内容被静默改写。锁文件位于已忽略的 `.erp-local-storage/`，它是部署输入和审计证据，不提交到源码仓库。

## 三、部署前复核

部署程序必须同时提供锁、目标和完整提交号；服务器使用全新提交目录，不能在共享工作区上覆盖更新：

```bash
npm run controlled-release:verify -- \
  --lock <release-lock-path> \
  --expected-target <target> \
  --expected-commit <full-40-character-commit> \
  --root-dir <clean-checkout-path>
```

受控前端构建必须从这一步进入，不能直接把普通本地 `dist` 上传：

```bash
npm run controlled-release:build -- \
  --lock <release-lock-path> \
  --expected-target <target> \
  --expected-commit <full-40-character-commit> \
  --root-dir <clean-checkout-path>
```

腾讯云远端恢复还必须把同一把锁传给生产恢复脚本：

```bash
node scripts/run-v1-production-remote-recovery.mjs \
  --repository-url <controlled-git-remote> \
  --expected-commit <full-40-character-commit> \
  --release-lock <tencent-production-lock-path> \
  --target-dir /opt/erp/releases/<full-40-character-commit> \
  --env-file /etc/erp/erp.production.env
```

## 四、构建和运行身份

前端构建写入 `VITE_ERP_RELEASE_*`，API 运行环境写入同一组 `ERP_RELEASE_*`：

- `TARGET`：目标环境；
- `COMMIT`：完整 40 位提交号；
- `VERSION`：人可读发布版本；
- `LOCK_DIGEST`：发布锁摘要；
- `BUILT_AT`：构建时间。

前端把受控信息写入 HTML `meta`、`document.documentElement.dataset` 与 `window.__ERP_RELEASE__`，不增加业务页面视觉噪声；API 的 `/api/health` 返回同一份安全版本身份。生产前端缺少有效的腾讯云发布身份时会直接拒绝构建。纯静态 `review-site` 核对前端身份即可；`staging` 和 `tencent-production` 必须同时核对前端与 API。

## 五、部署完成标准

以下条件同时满足才可称为“部署完成”：

1. 目标服务器检出的完整提交与发布锁一致；
2. 前端暴露的目标、版本、提交和锁摘要与发布锁一致；
3. `/api/health` 返回 `release.ready=true`，且目标、版本、提交和锁摘要一致；
4. 目标环境健康检查通过；
5. 评估站、测试环境或生产环境的地址和结果由本次集成/发布任务明确记录。

部署后使用同一把锁执行自动核对：

```bash
npm run controlled-release:postdeploy -- \
  --base-url <deployment-url> \
  --lock <release-lock-path> \
  --expected-target <target> \
  --expected-commit <full-40-character-commit>
```

只在本地看到页面、只完成构建、只上传静态文件、只重启服务、或者使用了不同提交的前端和 API，都不算完成。

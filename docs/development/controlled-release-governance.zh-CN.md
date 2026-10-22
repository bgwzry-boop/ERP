# ERP 单一版本与受控发布规则

## 唯一事实来源

项目只有一条发布线。对话负责修改任务，不能各自维护一个“当前版本”。受控仓库、默认分支、staging 地址和预览应用身份统一维护在 `deploy/release-policy.json`；不要在其他对话里另设常量。

- GitHub 默认分支及 staging 唯一基线：`codex/staging-current`。它必须等于线上前端和 `/api/health` 的完整 40 位提交。
- 原主目录保持在这条干净基线上；新任务 fetch 后从基线建立独立 `codex/` 分支/worktree。旧分支保留为来源证据，不另建“主项目最新版”目录。
- `4174` 是完整 ERP 本地修改稿，必须显示“本地修改稿 · 未部署”、来源提交及修改状态。它不代表服务器已发布。
- 本地预览运行期间持续刷新 Git 来源；主目录快进或产生未提交修改后，下次身份读取最多使用 500 毫秒内的缓存，不能永久沿用启动时的提交号。Git 读取失败必须显示未知来源或未确认修改状态，不能伪装为干净版本。
- 文档中的提交号是注明日期的核对快照；实时事实由下面的检查取得，不能用旧对话、旧文档或截图代替。

## 每个对话开工

先读 `AGENTS.md`、本文件、`00_项目入口.md`、`01_当前状态与下一步.md` 和 `DECISIONS.md`。在主目录运行：

```bash
npm run release:check
```

检查实时 GitHub 默认分支、远端基线、staging 前端/API 的提交/目标/版本/锁摘要，以及主目录分支、提交和未提交修改。非零退出即阻断，不可把断网当成一致。主目录有修改或分叉时先保留、审核；禁止自动 reset、stash、强推或覆盖。

任务树可用 `--main-dir <original-project-path>` 明确主目录；默认从同一 Git 仓库的 worktree 清单识别。CI/服务器使用 `--scope repository`，只验仓库和线上，报告会明确未检查用户电脑。若交付本地页面，先 `npm run review:dev`、`npm run review:check`，再可补 `release:check -- --preview-url http://127.0.0.1:4174 --preview-root <preview-worktree>`；这个补充检查核对应用身份、提交、修改标识和 API，不宣称能区分同 SHA 的不同脏工作树。

旧分支的 ahead/behind 数量不等于缺失代码。合并旧工作前必须逐个判断提交是否已是当前基线祖先，并检查文件差异；不要重复 cherry-pick 已集成工作。2026-10-22 已核对的旧 64 个提交全部进入 955bb605 的历史，不能继续当作待整合清单。

## 发布前自动检查

只有明确的集成/发布任务可以推广版本。候选必须干净、完整推送到自己的命名分支，且远端分支实时指向该提交。不能只相信本地 tracking ref。staging/review 候选必须包含当前基线；生产推广必须来自已经进入 staging 基线的提交。回退业务代码也要生成向前的新提交，不能强制倒退 canonical。

```bash
npm run controlled-release:prepare -- \
  --target staging \
  --expected-commit <full-40-character-commit> \
  --version staging-<date>-r<n> \
  --output .erp-local-storage/releases/staging.lock.json
```

目标仅允许 `review-site / staging / tencent-production`。生成 `erp-controlled-release-lock-v1` 前自动核对仓库默认入口、线上基线、候选祖先关系和真实远端分支；任一失败不写锁。锁含提交、目标、版本、分支、时间和 SHA-256 摘要；存于忽略的发布证据目录，不写入业务数据。

`controlled-release:verify` 和 `controlled-release:build` 也独立执行这些门禁，不能靠跳过 prepare 绕开：

```bash
npm run controlled-release:verify -- \
  --lock <lock-path> --expected-target <target> \
  --expected-commit <full-sha> --root-dir <clean-checkout>
npm run controlled-release:build -- \
  --lock <lock-path> --expected-target <target> \
  --expected-commit <full-sha> --root-dir <clean-checkout>
```

先在根目录和完整评审应用目录分别 `npm ci`。受控 build 对 staging/review 同时构建根应用及完整评审入口，二者使用同一把锁。生产保持严格认证，绝不能使用 staging 的登录例外。服务器从 Git bundle 恢复时，clone 后先将 origin 设为受控 GitHub 仓库；bundle 是传输载体，不是新的源仓库。

## 统一部署入口

所有服务器传输/构建/切换动作必须包在下列命令中。传输脚本由本次发布任务审核，负责现有基础设施的备份、候选启动、数据核对和可恢复切换；它不能自行推送 canonical。历史一次性 switch/upload 脚本不能单独当作完整部署命令。

```bash
npm run controlled-release:deploy -- \
  --lock <lock-path> --expected-target staging \
  --expected-commit <full-sha> \
  --base-url https://erp-staging.luxingpack.com/ \
  --main-dir <original-project-path> \
  --transport-script <reviewed-transport-script.sh>
```

包装入口顺序固定为 **发布前门禁 → 传输/构建/切换 → 自动收尾**。前一步失败就停止，不能打印“发布完成”。它向传输脚本提供 `ERP_CONTROLLED_RELEASE_LOCK / COMMIT / TARGET`，正式服务器使用全新提交目录，同锁身份写入前端 `VITE_ERP_RELEASE_*` 和 API `ERP_RELEASE_*`。未提交本地 dist 不得上传作发布产物。

## staging 自动收尾与失败恢复

部署包装器自动调用 `controlled-release:finalize`：

1. 核对候选锁与干净工作树、实时远端，确认主目录可安全快进。
2. 无缓存读取固定 staging 入口和 API；目标、完整提交、版本、锁摘要及健康必须全部吻合。首页还必须是 `bagwin-complete-review-4174` 完整评审应用，不能用同提交的旧工作台冒充。
3. 再次读取远端，防止核对期间其他发布移动基线；只允许非强制推送 canonical 到已验明提交。
4. 只对同仓库、正确分支、干净主目录做快进同步；同步本地 origin/HEAD。
5. 再核对一次本次锁、仓库默认入口、canonical 与主目录；保存 `finalization.json` 并给出带准确提交的 staging 地址。

收尾失败属于“发布未完成”。保留现场和报告；例如已更新远端但主目录同步失败，处理主目录问题后可重试：

```bash
npm run controlled-release:finalize -- \
  --lock <same-lock-path> --expected-commit <same-full-sha> \
  --main-dir <original-project-path>
```

重复执行不会强推、重置或删除修改。异常中断若残留 `.git/erp-release-finalize.lock` 或 `.git/erp-controlled-deploy.lock`，先确认发布进程已退出再清理锁目录，禁止并行发布绕过锁。不得为了合并 PR 提前移动 canonical；先在候选分支完成代码审查和验证，服务器实际运行候选并验明后，交给 finalize 前移。

## 自动复核与完成标准

`controlled-release:postdeploy` 是只读最终核验入口；staging 只接受规定公网地址，正式目标必须 HTTPS。只对纯静态 review-site 免 API，其他目标不得关闭 API 检查。每个请求禁用缓存、添加刷新参数、限制超时；失败不泄露响应正文或业务数据。

```bash
npm run controlled-release:postdeploy -- \
  --base-url <deployment-url> --lock <same-lock-path> \
  --expected-target <target> --expected-commit <same-full-sha>
```

- 每次推送 canonical 自动触发 GitHub **Release Identity**，核对该发布事件提交、仓库默认入口及线上前端/API，留存脱敏报告。
- 普通 CI 的核心检查自动运行发布规则失败用例，防止以后把检查拆掉或绕过。
- 生产放行 workflow 另要求受保护 `ERP_CONTROLLED_RELEASE_LOCK_B64`；核对生产服务器同一把锁，再做原有业务/现场证据门禁。生产恢复路径也在安装构建前核对发布线。环境秘密未配置会阻断，不会降低要求。
- CI 不代表真实打印、贴标扫码、岗位验收或生产业务放行。版本一致、业务测试、现场验收分别如实报告。

发布完成后，负责对话打开带 `erpRelease=<full-sha>` 的 staging URL，再报告地址、目标、版本、完整提交、锁摘要、自动检查结果和未验收边界。不要把用户留在 4174 本地页，也不要宣称任何脚本能阻止持有服务器管理员权限的人绕过流程；标准发布入口和每次 canonical 更新已经自动核对。

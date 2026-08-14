# V1 生产部署、恢复与回滚手册

更新日期：2026-08-04

## 一、适用范围

本手册用于 V1 小范围真实使用的 Linux API / Web 主机部署与恢复。它只解决代码部署、进程托管、静态站点、健康检查、日志、备份前置和版本回滚，不替代以下现场验收：

- 真实 PostgreSQL、专用恢复验证库和对象存储的账号开通。
- Windows 打印主机、CUPS、标签机、针式打印机和司机真机验证。
- 真实业务试跑、34 项现场证据、6 个负责人签字和 V1/V2 边界确认。

生产数据库、对象存储和认证密钥只能写入安全未跟踪 env 文件；不得写入 systemd unit、nginx 配置、Git、普通日志或本手册。

## 二、固定拓扑

```text
浏览器 / 手机
  -> HTTPS nginx :443
     -> /assets、SPA：/opt/erp/current/dist
     -> /api/*：127.0.0.1:8787
        -> erp-api.service
           -> PostgreSQL
           -> OSS / S3 / COS
     -> /api/v1/integrations/bagwin/orders*：127.0.0.1:8790
        -> erp-bagwin-integration.service（HMAC 接单、状态、对账）

erp-price-release-worker.service
  -> 小程序价格接收器（ERP 权威价格发布）

erp-miniapp-artwork-worker.service
  -> 小程序稿件接收器（一次性 HMAC 拉取、SHA-256 复核）
```

生产目录：

```text
/opt/erp/releases/<full-commit>/   每个版本独立目录
/opt/erp/current                  指向当前版本的软链接
/etc/erp/erp-service.env          仅 systemd 接线，不放业务密钥
/etc/erp/erp.production.env       经审计的生产真实值，erp:erp 0600
/etc/erp/tls/                     TLS 证书目录
/var/lib/erp/                     健康检查和受控运行目录
/var/spool/erp-print/             打印 command bridge 状态目录
```

固定版本要求：Node.js 24、npm 10 以上。仓库通过 `.nvmrc` 和 `package.json#engines` 锁定该边界。

## 三、主机首次准备

由技术运维使用管理员账号执行，业务账号不得拥有 `/etc/erp`、systemd 或 nginx 修改权限。

```bash
sudo useradd --system --home /var/lib/erp --shell /usr/sbin/nologin erp
sudo install -d -o root -g erp -m 0750 /etc/erp /etc/erp/tls
sudo install -d -o erp -g erp -m 0750 /opt/erp/releases /var/lib/erp /var/spool/erp-print
sudo install -o root -g erp -m 0640 deploy/production/erp-service.env.example /etc/erp/erp-service.env
sudo install -o root -g root -m 0644 deploy/production/systemd/erp-api.service /etc/systemd/system/erp-api.service
sudo install -o root -g root -m 0644 deploy/production/systemd/erp-api-healthcheck.service /etc/systemd/system/erp-api-healthcheck.service
sudo install -o root -g root -m 0644 deploy/production/systemd/erp-api-healthcheck.timer /etc/systemd/system/erp-api-healthcheck.timer
sudo install -o root -g root -m 0644 deploy/production/systemd/erp-bagwin-integration.service /etc/systemd/system/erp-bagwin-integration.service
sudo install -o root -g root -m 0644 deploy/production/systemd/erp-price-release-worker.service /etc/systemd/system/erp-price-release-worker.service
sudo install -o root -g root -m 0644 deploy/production/systemd/erp-miniapp-artwork-worker.service /etc/systemd/system/erp-miniapp-artwork-worker.service
sudo install -o root -g root -m 0644 deploy/production/systemd/erp-miniapp-integration-healthcheck.service /etc/systemd/system/erp-miniapp-integration-healthcheck.service
sudo install -o root -g root -m 0644 deploy/production/systemd/erp-miniapp-integration-healthcheck.timer /etc/systemd/system/erp-miniapp-integration-healthcheck.timer
```

把审核后的生产 env 安装为：

```bash
sudo install -o erp -g erp -m 0600 <secure-production-env> /etc/erp/erp.production.env
```

然后执行现有安全检查，不要打印文件内容：

```bash
node scripts/run-v1-production-env-file-audit.mjs --env-file /etc/erp/erp.production.env
node scripts/run-v1-production-env-intake-verify.mjs --env-file /etc/erp/erp.production.env
node scripts/run-v1-production-env-preflight.mjs --env-file /etc/erp/erp.production.env
```

任一报告 blocked 时停止部署。

小程序接入启用时，安全 env 还必须提供三组互不复用的 HMAC 凭据：订单接单、价格发布、稿件拉取。ERP 的 `BAGWIN_ERP_HMAC_*` 与小程序的 `ERP_HTTP_*` 成对；ERP 的 `MINIAPP_PRICE_RELEASE_HMAC_*` 与小程序的 `PRICE_RELEASE_HMAC_*` 成对；ERP 的 `MINIAPP_ARTWORK_HMAC_*` 与小程序的 `ARTWORK_TRANSFER_HMAC_*` 成对。两条 ERP 到小程序的 base URL 在生产模式必须是 HTTPS。

生产 env 的 `ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR` 必须使用 `/var/spool/erp-print`；systemd 的 `ProtectSystem=strict` 只对白名单目录开放写权限。若现场打印桥在独立 Windows 主机上使用其他共享目录，必须先由技术运维调整 unit 的 `ReadWritePaths` 并重新执行部署清单检查，不能直接放宽整个文件系统。

## 四、候选提交和全新目录恢复检查

发布必须固定到完整 40 位 commit，禁止只按可移动分支名部署。

先按照[《ERP 单一版本与受控发布规则》](./controlled-release-governance.zh-CN.md)从干净、已推送且与上游一致的候选分支生成 `tencent-production` 发布锁。工作区脏、提交未推送或锁与候选提交不一致时禁止继续。

先在当前候选仓库检查部署清单：

```bash
node scripts/run-v1-production-deployment-manifest.mjs --json
```

必须满足：受控 Git 远端已配置、工作区干净、Node 24、锁文件、构建产物、systemd/nginx、健康检查和本手册全部通过。

再在另一台受控主机或隔离恢复目录执行：

```bash
node scripts/run-v1-production-remote-recovery.mjs \
  --repository-url <controlled-git-remote> \
  --expected-commit <full-40-char-commit> \
  --release-lock <tencent-production-release-lock> \
  --target-dir /opt/erp/releases/<full-40-char-commit> \
  --env-file /etc/erp/erp.production.env \
  --json
```

该检查固定执行：

1. 复核 `tencent-production` 发布锁、目标、完整提交和摘要。
2. 安全 env 审计。
3. 在不存在的新目录 clone。
4. detached checkout 固定 commit 并复核一致性。
5. `npm ci --ignore-scripts --no-audit --no-fund`。
6. 以同一发布锁身份执行生产前端构建。
7. 数据库迁移 dry-run。
8. 部署清单复核。
9. 从安全 env 启动临时生产 API，执行只读 runtime smoke 后停止。

失败目录不会自动删除或覆盖，保留给技术运维排查。报告不包含远端地址、目标路径、env 路径、命令输出或密钥。

## 五、数据库和对象存储放行

切换版本前，依次执行：

```bash
node scripts/run-v1-production-postgres-preflight.mjs --env-file /etc/erp/erp.production.env
node scripts/run-v1-production-object-storage-preflight.mjs --env-file /etc/erp/erp.production.env
node scripts/run-v1-production-object-storage-governance-check.mjs --env-file /etc/erp/erp.production.env
```

迁移前必须先确认备份窗口、负责人和恢复验证库。恢复抽样只能指向专用可重置验证库：

```bash
node scripts/run-v1-production-postgres-backup-restore-check.mjs \
  --env-file /etc/erp/erp.production.env \
  --allow-restore-reset
```

禁止把生产库设置为恢复验证目标。只有备份、恢复抽样和迁移计划均通过后，才能在批准窗口执行：

```bash
node scripts/run-db-migrations.mjs --env-file /etc/erp/erp.production.env --apply
```

迁移后立即再跑一次迁移 apply，第二次必须显示无 pending，用于证明重复执行安全和 checksum 一致。

## 六、切换版本

确认目标 release 已通过全新目录恢复检查后，以原子软链接方式切换：

```bash
sudo ln -s /opt/erp/releases/<full-40-char-commit> /opt/erp/current.next
sudo mv -Tf /opt/erp/current.next /opt/erp/current
sudo systemctl daemon-reload
sudo systemctl restart erp-api.service
sudo systemctl restart erp-bagwin-integration.service
sudo systemctl restart erp-price-release-worker.service
sudo systemctl restart erp-miniapp-artwork-worker.service
sudo systemctl enable --now erp-api-healthcheck.timer
sudo systemctl enable --now erp-miniapp-integration-healthcheck.timer
```

API 只监听 `127.0.0.1:8787`。systemd 发送 `SIGTERM` 时，API 停止接收新请求，等待在途请求结束，关闭共享 PostgreSQL 连接池；25 秒未完成时强制退出，systemd 总停止上限为 30 秒。

## 七、nginx 和前端

复制模板后必须替换 `erp.example.invalid`，并配置真实受控 TLS 证书：

```bash
sudo install -o root -g root -m 0644 deploy/production/nginx/erp.conf /etc/nginx/conf.d/erp.conf
sudo install -d -o root -g root -m 0755 /etc/erp/nginx
sudo install -o root -g root -m 0644 deploy/production/nginx/miniapp-integration-allowlist.conf.example /etc/erp/nginx/miniapp-integration-allowlist.conf
sudo nginx -t
sudo systemctl reload nginx
```

安装 allowlist 后必须先把文档专用的 `192.0.2.10/32` 替换为小程序 BFF 的真实固定出口 CIDR，并保留最后一行 `deny all`；未取得固定出口时不得开放该入口。订单接入公网路径只转发到回环 `8790`，不能落到普通 ERP API 进程。

验收：

```bash
curl --fail --silent --show-error https://<erp-host>/healthz
```

浏览器必须通过同源 `/api` 访问后端，不能使用构建默认值 `http://127.0.0.1:8787/api`。不得绕过 nginx 向局域网暴露 8787 端口。

## 八、健康检查、日志和告警

周期探针：

```bash
systemctl status erp-api-healthcheck.timer
systemctl list-timers erp-api-healthcheck.timer
systemctl status erp-api-healthcheck.service
systemctl status erp-miniapp-integration-healthcheck.timer
systemctl status erp-miniapp-integration-healthcheck.service
```

探针检查 8 项：HTTP、health 状态、production 模式、安全 env 已应用、PostgreSQL profile、无不支持仓储、附件对象存储、对账导出对象存储。它不输出 API URL、响应正文、业务数量、env 路径或密钥。

日志：

```bash
journalctl -u erp-api.service --since today
journalctl -u erp-api-healthcheck.service --since today
journalctl -u erp-bagwin-integration.service --since today
journalctl -u erp-price-release-worker.service --since today
journalctl -u erp-miniapp-artwork-worker.service --since today
journalctl -u erp-miniapp-integration-healthcheck.service --since today
tail -n 200 /var/log/nginx/error.log
```

小程序接入健康检查只输出服务布尔状态和队列计数，不输出订单号、客户、稿件 ID、价格摘要、连接串或密钥。任一 dead job、过期租约或超过 15 分钟仍到期未处理的任务都会使检查失败；稿件 dead job 还会在 ERP 待办中产生 `小程序稿件传输失败`，正式订单确认继续被数据库门禁阻止。

正式放行前，技术运维必须把以下事件接入工厂现有受控告警渠道，并保留一次测试告警记录：

- `erp-api.service` 进入 failed 或连续重启。
- `erp-api-healthcheck.service` 失败。
- `erp-bagwin-integration.service`、价格 worker 或稿件 worker 进入 failed / 连续重启。
- `erp-miniapp-integration-healthcheck.service` 失败，或价格 / 稿件队列出现 dead、过期租约、持续积压。
- nginx 5xx 超阈值。
- PostgreSQL 连接、容量或备份任务异常。
- 对象存储访问、容量、生命周期或加密策略异常。

本仓库不内置任意 webhook 密钥，避免把告警凭据写入代码；具体告警适配由技术运维在主机监控系统中配置。

## 九、应用版本回滚

回滚只允许切换到已验证的上一版本目录。先记录当前提交、上一提交、操作人、原因和时间。

```bash
sudo systemctl stop erp-api.service
sudo ln -s /opt/erp/releases/<previous-full-commit> /opt/erp/current.next
sudo mv -Tf /opt/erp/current.next /opt/erp/current
sudo systemctl start erp-api.service
curl --fail --silent --show-error http://127.0.0.1:8787/api/health
```

迁移采用向前兼容策略，应用回滚不自动执行数据库 down migration。若新迁移与旧应用不兼容，停止业务流量，按已批准的数据库恢复方案恢复到独立新库，复核后再切换连接；禁止直接重置生产库。

若仅回滚小程序接入能力，先在 Nginx allowlist 中关闭小程序来源并 reload，再停止三个接入服务；已进入 ERP 的草稿、价格发布记录和稿件任务不得删除。恢复服务后由幂等接单、价格 outbox 和租约任务继续处理。当前 `ERP_FIRST_RELEASE_SCOPE=raw_material` 仍是正式业务写入边界：在另行批准扩大范围前，小程序仅允许 Staging / UAT 验证到 ERP 草稿和待办，不得据此开放真实订单流量。

回滚后执行：

```bash
node scripts/run-v1-production-runtime-smoke.mjs \
  --env-file /etc/erp/erp.production.env \
  --api-base-url http://127.0.0.1:8787/api
```

## 十、整机或目录丢失恢复

1. 准备新主机和 `erp` 系统账号。
2. 从受控 Git 远端按完整 commit 运行全新目录恢复检查。
3. 从安全渠道恢复 `/etc/erp/erp.production.env`，权限设为 `0600`。
4. 在专用验证库证明备份可恢复，再恢复生产数据到新库或批准目标。
5. 复核对象存储 bucket、版本控制、生命周期、加密和权限策略。
6. 安装 systemd/nginx 配置并切换 `current`。
7. 执行 runtime smoke、周期健康检查和浏览器登录验证。
8. 保留提交 ID、备份 ID、恢复时间、检查报告、操作人和复核人记录。

## 十一、R2 退出证据

以下证据全部存在才能把 R2 标记完成：

- 真实 PostgreSQL 迁移、checksum、重复执行和并发事务报告。
- 专用恢复验证库的备份恢复抽样报告。
- 真实对象存储写入、读回、签名访问、删除和治理报告。
- 受控 Git 远端和干净候选提交的部署清单报告。
- 另一台受控主机或隔离主机的 `9/9` 全新目录恢复报告。
- systemd API 启停、优雅停机、nginx TLS、周期 health 的运行记录。
- 至少一次测试告警记录。
- 一次应用版本回滚演练记录；涉及数据库时还需恢复演练记录。

本地专项测试通过只能证明工具和护栏可用，不能替代上述真实服务证据。

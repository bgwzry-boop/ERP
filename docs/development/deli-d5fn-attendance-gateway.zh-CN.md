# 得力 D5FN 考勤网关接入说明

## 当前边界

ERP 继续使用可替换的 HTTPS JSON 考勤来源：

`ERP → HTTPS /v1/punches/query → 独立得力网关 → 得力E+云接口`

独立网关已在代码中实现，但尚未连接工厂真实得力账号和设备。通过本地测试只证明协议、鉴权和数据边界正确，不能当作现场连通证据。

## 官方接口

- 官方服务地址：`https://v2-api.delicloud.com`
- 请求路径：`POST /v2.0/cloudappapi`
- 模块/命令：`Api-Module: CHECKIN`、`Api-Cmd: checkin_query`
- 签名：`MD5(path + 13位毫秒时间戳 + App-Key + App-Secret)`，输出小写十六进制
- 分页：`next_id + page_size`，单页最多 `500` 条，直到数据列表为空
- 当前使用字段：`id / ext_id / check_type / check_time`
- 官方资料：[综合签到应用API](https://doc.delicloud.com/v3/integration/oa.html)、[内部应用接入说明](https://doc.delicloud.com/v2/internal/integration/oa/)

`ext_id` 是唯一允许进入 ERP 员工映射的得力人员标识；不得按姓名匹配，也不得回退到 `user_id`。官方记录中的 `check_data` 可能包含设备或位置细节，本网关不会转发或持久化该字段。

## 运行方式

启动入口：

```text
npm run deli-attendance-gateway:production
```

正式启动前必须先执行脱敏配置预检：

```text
npm run deli-attendance-gateway:production-preflight -- --env-file /etc/erp/deli-attendance-gateway.env
```

预检不连接得力、不连接 PostgreSQL，也不会打印 App-Key、App-Secret、Bearer 令牌、数据库连接串或 env 文件路径。它失败关闭地检查：真实凭证不是占位值、网关令牌不少于 32 位、三类身份不复用、上游固定为得力官方 HTTPS 地址、分页/超时处于安全范围、游标缓存使用 PostgreSQL、Node 进程只监听 loopback，以及查询路径固定为 `/v1/punches/query`。示例 systemd service 已用 `ExecStartPre` 强制执行同一预检，预检未通过时网关不会启动。

网关默认只监听 `127.0.0.1:8792`，生产环境应由 Nginx/Caddy 等反向代理发布为 HTTPS。得力凭证与网关 Bearer 令牌只放入网关进程专用、审计过且权限为 `0600` 的环境文件；不得进入前端、Git、浏览器、本地存储、日志或 ERP 返回体。

环境变量模板见 `docs/development/v1-production.env.example`。ERP 使用的 `ERP_ATTENDANCE_PROVIDER_TOKEN` 必须等于网关的 `DELI_ATTENDANCE_GATEWAY_TOKEN`，但 ERP 不持有 `DELI_EPLUS_APP_SECRET`。`DELI_ATTENDANCE_GATEWAY_DATABASE_URL` 使用受限 PostgreSQL 账号，只允许访问游标和脱敏打卡缓存表。

得力同步是增量接口。网关把官方 `next_id` 与最小化打卡缓存原子保存到 `deli_attendance_gateway_cursors / deli_attendance_gateway_punches`；ERP 的只读预检与随后正式导入从同一缓存查询，因此预检不会“吃掉”一批记录，进程重启也不会重新从0扫描全部历史。

## 正式上线前仍需完成

1. 向得力确认并开通/购买综合签到 API 服务，取得正式 App-Key/App-Secret。
2. 由得力或受权操作人确认组织与 D5FN 已完成接口初始化；代码不会自动调用一次性的 `checkin_query_init`。
3. 将每名在职员工的得力 `ext_id` 与 ERP `员工编号`映射逐一核对，禁止姓名自动匹配。
4. 在服务器部署独立网关，使用 loopback 监听、独立低权限账号、`0600` 环境文件和 HTTPS 反代；先保存生产预检的脱敏 JSON/文本结果。
5. 先执行 ERP 的只读 `同步预检`，只核对汇总数量、字段完整度、重复打卡和映射覆盖，不写正式考勤。
6. 预检无阻塞后再按一个小时间窗执行首次正式导入，并核对原始打卡、异常、工时和手机端本人视图。
7. 形成网关健康、真实只读请求、员工映射、时间/时区、重复/重试和权限审计证据后，才能把考勤来源门禁改为通过。

## 安全与失败关闭

- 上游超时、HTTP错误、非JSON、业务错误、游标倒退或超过安全分页上限均整批失败，不返回半截结果。
- 网关只接受 `application/json` 与正确 Bearer 令牌；健康检查不返回配置和凭证。
- ERP 的导入写动作会再次核验字段、半开时间范围、重复打卡号、员工映射与在职员工覆盖；任何一项失败都不会写入批次或打卡。
- 网关测试不得使用真实 App-Key/App-Secret，也不得把得力错误正文原样回显。

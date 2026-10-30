# 037afd09更新与受控前向恢复（2026-10-30）

负责人已确认037afd09b4b167a9973b2854fac12487cf2e7592完整功能检查通过，并授权将受控恢复补丁合入形成新提交后只发布staging。该提交全部40个路径的业务更新原样保留；本任务只增加发布恢复门禁、失败回归与治理说明，不修改业务语义。

普通发布在canonical提前推进时仍阻断。显式恢复凭据绑定原线上完整r2锁、提前基线037afd09、干净主目录6c79db38及两小时授权期限，纳入新锁摘要；prepare/verify/build/deploy分别核对真实前后端旧身份、远端、祖先链和干净主目录。生产不适用，没有环境变量跳过路径，finalize与postdeploy保持原样。

版本名staging-20261030-037-r1，完整新提交以提交并推送后的实际SHA为准。只通过controlled-release:deploy调用审核后的传输脚本；54个迁移无变化，本次不执行DDL，先备份并对比全部业务表摘要，再独立构建/启动、原子切换和保留r2回滚点。新版本真实运行后才非强制推进基线与快进主目录，最终普通release:check/postdeploy必须全部通过。

部署后在实际新release目录执行node scripts/run-staging-demo-data-inventory.mjs --env-file /etc/erp/erp.production.env。该脚本使用只读事务及只读连接选项，疑似测试数据仅供负责人判断，不授权清理。不得删除、确认、重解析现有单据，不调用收费OCR，不触碰正式生产。

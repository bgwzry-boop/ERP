# 图片与文件上传限制清单

本清单是 ERP 与【下单小程序】共用的当前规则。前端只负责提前提示，后端仍是最终校验方。

| 业务用途 | 支持类型 | 单文件上限 | 实际接口与处理方式 |
|---|---|---:|---|
| 原材料送货单手机照片 | PNG / JPG / JPEG / BMP | 原图 30MB | `POST /api/raw-material-inbounds/recognize-delivery-note`；浏览器自动生成不超过 7.5MB 的 OCR 识别副本，Base64 编码不超过 10MB，同时保留原图附件 |
| 原材料送货单 PDF | PDF | 7.5MB | 同上；当前不在浏览器内自动压缩 PDF |
| 付款截图、送达水印、签收照片、定制成品图、维修照片 | 图片 | 30MB | `POST /api/attachments`；Base64 JSON 上传并写入统一附件存储 |
| 客户确认、库存修正凭证 | 图片 / PDF | 30MB | `POST /api/attachments` |
| 经营决定、V1 现场、签字边界等普通文档证据 | 图片 / PDF / 表格 / Word 等文档 | 50MB | `POST /api/attachments`；数据库经营决定凭据门禁同步为 50MB |
| ERP 订单印刷定稿 | PSD / CDR / AI / PDF / PNG / JPG / JPEG | 200MB | `POST /api/attachments/binary`；直接传二进制并写入对象存储，不进入 Base64 JSON |
| 【下单小程序】客户印刷定稿 | PSD / CDR / AI / PDF / PNG / JPG / JPEG | 200MB | `POST /v1/miniapp/files/upload-ticket` → `POST /v1/miniapp/files/{fileToken}/upload` → `POST /v1/miniapp/files/{fileToken}/complete` |

补充约束：

- ERP JSON 请求体上限为 72MiB，用来容纳最大 30MB 原图与自动生成的 OCR Base64 副本；200MB 印刷定稿不得使用该通道。
- ERP 生产 Nginx 的普通请求体门槛为 75MiB，`/api/attachments/binary` 单独放宽到 210MiB 并使用 300 秒上传/响应超时；API 仍按业务用途执行 30MB / 50MB / 200MB 最终校验。
- 印刷定稿上传后必须保留附件 ID / fileToken、原始文件名、字节数、MIME、内容摘要或检查状态、上传人和稿件版本。
- 200MB 是当前单文件业务上限，不表示浏览器、小程序、反向代理和对象存储的真实大文件验收已经完成；上线前仍需用接近上限的 PSD/CDR 真文件做 live 验收。

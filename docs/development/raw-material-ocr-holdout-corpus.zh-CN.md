# 原材料 OCR 四格式留出样本门禁

最后更新：2026-07-16（V8.291）

## 用途

本门禁用于验证第二批、未参与当前解析规则调整的真实供应商送货单，避免只用四张基准单据得出“可上线”结论。它只验证已保存的腾讯云表格 OCR 行能否被当前解析器稳定还原为已确认的逐行和整单结果；不替代原图 OCR 质量、标签打印、现场逐卷人工核对贴标、异常卷隔离、领料时手机扫码或 D49-D53。

必须覆盖以下四种格式各至少一份：

- `count_total_per_roll_weights`：件数、总重和多列分卷重量。
- `one_weighed_roll_per_row`：每行一卷实称重量。
- `variable_per_roll_weights`：同一行可变数量分卷重量。
- `supplier_number_optional`：供应商未提供原始单号。

## 私有文件

样本只能放在 `.erp-local-storage/raw-material-ocr-holdout/`，目录权限为 `0700`、文件为 `0600`，不提交 Git。每份样本保存第二批真实单据已经产生的 OCR 表格行和办公室确认后的预期值；不要在模板、提交记录、命令输出或对话中粘贴供应商名称、单号、原始表格、金额或原图。

显式创建空模板：

```bash
node scripts/run-raw-material-ocr-holdout-template.mjs --confirm-template-create
```

填写后的私有文件需包含：`caseId`、`formatKey`、仅说明“已保存腾讯OCR表格输出”的 `sourceEvidence`、`ocrTableRows` 和 `expected`。`expected` 必须逐行给出品名、材料、颜色、规格、卷件数、总重、单位、单价、金额和分卷重量，并给出供应商、可空单号、日期、整单卷件数、总重和金额。

## 执行

```bash
node scripts/run-raw-material-ocr-holdout-precheck.mjs --file .erp-local-storage/raw-material-ocr-holdout/<private-json>
```

通过时只输出样本数、四格式覆盖数、解析行数和卷件数。任何缺格式、预期不一致、缺字段、非私有权限或非法表格会失败关闭；模板或没有第二批样本时始终为 `blocked`。专项实现检查为：

```bash
npm run raw-material-ocr-holdout:check
```

该专项已纳入 `npm run raw-material-inbound-api:check`，但仅验证门禁机制。实际私有样本预检通过后，仍需办公室按原图复核、标签机打印、按重量/颜色/规格与实物逐卷人工核对贴标、隔离异常卷，并在后续领料出库时验证手机扫码。签单照片如保留只作为单据附件，不是入库门禁。

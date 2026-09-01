# Design QA · 办公室手机流程同步

- QA 日期：2026-08-18
- 实现范围：仅 `office` 流程；其他岗位未纳入本轮改动
- 部署基线：`v0.8.307-preview.28` / `fa45ed0f127cf73f8877ad5eb184c0d817dc4fb0`
- 目标视口：390 × 844 CSS px

## 对照输入

### 拍单页

- 参考：`/var/folders/4m/6x1m7vhd3735nrdld71mcrf80000gn/T/codex-clipboard-7a29ceaa-ba4a-405e-bd23-9b40641d6439.jpg`
- 实现：`http://127.0.0.1:4185/docs/prototypes/mobile-role-flow-atlas/?role=office&screen=capture&variant=delivery-pages&preview=office-fa45-sync-20260818`
- 状态：管理A；收货入库；已拍 3 页；开始识别 3 页
- 同图对照：参考图去除 Safari 外壳后与 390px 实现截图并排检查

### 核对页

- 参考：`/var/folders/4m/6x1m7vhd3735nrdld71mcrf80000gn/T/codex-clipboard-6c175ec8-5001-410c-8122-150effb825b4.jpg`
- 实现：`http://127.0.0.1:4185/docs/prototypes/mobile-role-flow-atlas/?role=office&screen=review&variant=two-confirmed&preview=office-fa45-sync-20260818`
- 状态：`RMI-OCR-D6BCA7541B6E`；3 页；22 卷；2192.1 kg；已确认 2/22
- 同图对照：参考图去除 Safari 外壳后与 390px 实现截图并排检查

## 检查结果

- P0：0
- P1：0
- P2：0
- P3：参考截图中的真实票据照片在图谱中使用已有审计示例图替代；页数、缩略图结构、原图区域、逐行证据裁切和业务数据均按部署状态同步，不影响版本核对。
- 横向溢出：0 px
- 浏览器控制台错误/警告：0
- 交互验证：`开始识别 3 页` 可进入 `核对送货单`；逐卷 `核对正确` 可把 2/22 更新为 3/22。
- 自动检查：`node scripts/check-mobile-role-flow-atlas.mjs` 通过；JavaScript 语法检查通过；`git diff --check` 通过。

final result: passed

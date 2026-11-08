// 写操作失败的提示不得把数据库/驱动原文给用户。
import assert from "node:assert/strict";
import { formatWriteFailureMessage } from "../src/shared/ui/errorPresentation.js";

const rawPg = 'duplicate key value violates unique constraint "order_draft_lines_pkey"';
const notice = formatWriteFailureMessage({ message: rawPg });
assert.doesNotMatch(notice, /duplicate key|constraint|pkey/iu, "不得显示数据库原文");
assert.match(notice, /[\u4e00-\u9fa5]/u, "必须给出中文提示");

const withPrefix = `识别结果待核对，当前内容已锁定，请按原内容重试。${formatWriteFailureMessage({ message: rawPg }, "")}`.trim();
assert.doesNotMatch(withPrefix, /duplicate key|pkey/iu);
assert.match(withPrefix, /按原内容重试/u);

assert.equal(formatWriteFailureMessage({ message: "客户名称必填" }), "客户名称必填", "中文业务错误必须原样保留");
assert.match(formatWriteFailureMessage({ message: "ECONNREFUSED" }), /[\u4e00-\u9fa5]/u, "英文连接错误也要转成中文");
assert.match(formatWriteFailureMessage({}), /[\u4e00-\u9fa5]/u, "空消息要有兜底提示");
assert.doesNotMatch(formatWriteFailureMessage({ message: "column order_draft_lines.id does not exist" }), /column|does not exist/iu);

console.log("Write error message checks passed: raw database text replaced, Chinese business errors preserved.");

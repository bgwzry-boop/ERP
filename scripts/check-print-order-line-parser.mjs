// 负责人 2026-11-08：用工厂 10 天真实定制丝印单（发给印刷、制袋车间的写法）验证识别。
// 【】里是印刷内容；最后是客户简称；「某某印」是来料加工；「N号发」是客户要求的发货日期；3038 一律按 3037。
import assert from "node:assert/strict";
import { looksLikePrintOrderLine, parsePrintOrderLine } from "../shared/printOrderLineParser.js";
import { detectMessageCustomer } from "../shared/orderMessageCustomer.js";
import { parseOrderText } from "../src/lib/orderParser.js";

const now = new Date("2026-10-30T02:00:00Z"); // 北京时间 10 月 30 日上午录单
const row = (line) => {
  const parsed = parsePrintOrderLine(line, { now });
  return { customer: parsed.customerName, content: parsed.printContent, peer: parsed.peerProcessor, side: parsed.side, latest: parsed.latest,
    handle: parsed.handle, notes: parsed.notes, rows: parsed.rows.map((item) => [item.size, item.bagColor, item.printColor, item.handleColor, item.qty]) };
};
const cases = [
  ["【金菊】30*38*10 双面印刷 3000个 橘黄白字（双面一样） 等通知印刷  松",
    { customer: "松", content: "金菊", latest: "", rows: [["30*37*10", "橘黄", "白色", "", 3000]] }],
  ["【全优科创思维馆】35*27  紫袋黄字  双面不同版满版印2000个 腾腾  自己写30号发",
    { customer: "腾腾", latest: "2026-10-30", rows: [["35*27*10", "紫色", "黄色", "", 2000]] }],
  ["【天牙口腔-克拉玛依店】30号发货  30*38*10 双面印刷 一万个 海蓝 白字（双面相同） 元宝",
    { customer: "元宝", content: "天牙口腔-克拉玛依店", rows: [["30*37*10", "海蓝", "白色", "", 10000]] }],
  ["【五香腊肉】40X30  3000个  双面 红色白字  晓佳，11月1号发货",
    { customer: "晓佳", latest: "2026-11-01", rows: [["40*30*10", "红色", "白色", "", 3000]] }],
  ["【戴氏教育】横版小号35/27  牛仔蓝  米色手提  3千  孙丽贤，31号发货",
    { customer: "孙丽贤", latest: "2026-10-31", rows: [["35*27*10", "牛仔蓝", "", "米白", 3000]] }],
  ["【胜财学府】40*30*10双面印刷1万个 米白袋 咖啡字+卡其提【双面不同】  松  自己写1号",
    { customer: "松", latest: "2026-11-01", rows: [["40*30*10", "米白", "咖色", "卡其", 10000]] }],
  ["【斐然】尺寸是35*27*10的   5000个双面  陈梦赛印",
    { customer: "陈梦赛", peer: "陈梦赛", rows: [["35*27*10", "", "", "", 5000]] }],
  ["【皮衣皮草】45*37   黑色袋子和提手·白字   2000 个双面印刷  王晓康  自己写1号发",
    { customer: "王晓康", rows: [["45*37*10", "黑色", "白色", "黑色", 2000]] }],
  ["【南无阿弥陀佛】上机器，横版40/32红袋1万个，双面黄字，加急  向如，1号发货",
    { customer: "向如", rows: [["40*32*10", "红色", "黄色", "", 10000]] }],
  ["【福乐康诊所】25*32 果绿印大红 2000双面不同版  正常范围 按文件印刷  腾腾  1号发",
    { customer: "腾腾", rows: [["25*32*10", "果绿", "红色", "", 2000]] }],
  ["【鑫梦源】：31号发货 50厘米提手 50×40×12 双面印刷 2000个焦糖白字咖提 双面一样  松",
    { customer: "松", handle: "加长提", rows: [["50*40*12", "焦糖", "白色", "咖色", 2000]] }],
  ["【小魔怪男装】25*32 黑 2000个双面白    45*37 黑 2000个双面白  伟东  自己写2号发",
    { customer: "伟东", rows: [["25*32*10", "黑色", "白色", "", 2000], ["45*37*10", "黑色", "白色", "", 2000]] }],
  ["【邵武市妇女联合会】竖版大号35/41   红色袋子  黄色印刷  2千个   孙丽贤，31号发货",
    { customer: "孙丽贤", rows: [["35*41*12", "红色", "黄色", "", 2000]] }],
  ["【贝康口腔】竖版30天蓝色白字1万个双面不同印刷有文件  高佳坡，11月1号发货",
    { customer: "高佳坡", rows: [["30*37*10", "天蓝", "白色", "", 10000]] }],
  ["【LEGEND】35/27，40/32，45/37，各8件 陈梦赛印",
    { customer: "陈梦赛", peer: "陈梦赛", rows: [["35*27*10", "", "", "", 8], ["40*32*10", "", "", "", 8], ["45*37*10", "", "", "", 8]] }],
  ["【酉阳】31号必须发  30*38*10 双面印刷 8000个 大红 宝石蓝 各 4000个 白字 双面一样  松",
    { customer: "松", latest: "2026-10-31", rows: [["30*37*10", "红色", "白色", "", 4000], ["30*37*10", "宝石蓝", "白色", "", 4000]] }],
  ["【澜森教育】40*30*10 单面印刷 2000个 芋泥紫 紫字 紫提   元宝  自己写30号发",
    { customer: "元宝", side: "单面", rows: [["40*30*10", "芋泥紫", "紫色", "紫色", 2000]] }],
  ["【老地方】29号发货 40*30*10 45*37*10 单面印刷 各2000个 咖啡袋米白字+米提  松",
    { customer: "松", rows: [["40*30*10", "咖色", "米白", "米白", 2000], ["45*37*10", "咖色", "米白", "米白", 2000]] }],
  ["【168】  3527  宝蓝色 2000个  双面印刷  白色  加急自己写28号发  魏少康",
    { customer: "魏少康", content: "168", rows: [["35*27*10", "宝蓝", "白色", "", 2000]] }],
  ["【华美牙科华阳店】横款中号 3000个 宝蓝印白 双面不同内容  加急，30号31号发",
    { customer: "", latest: "2026-10-30", rows: [["40*30*10", "宝蓝", "白色", "", 3000]] }],
  ["【蓝舒】：25号发货35*27*10双面印刷2000个安哥拉红 白字 咖啡提【双面相同】【元宝】",
    { customer: "元宝", rows: [["35*27*10", "安哥拉红", "白色", "咖色", 2000]] }],
  ["【万聪】【23号发2个地址各 1000个】35*27*10  双面印刷 2000个宝石蓝 白字 【双面不同】  松",
    { customer: "松", rows: [["35*27*10", "宝石蓝", "白色", "", 2000]] }],
  ["【兔斯康24号发  40*30*10 双面印刷 3000个 橘黄色 白字【双面不同】   松",
    { customer: "松", content: "兔斯康", rows: [["40*30*10", "橘黄", "白色", "", 3000]] }],
  ["【戴翔口腔诊所】 25*32   米袋绿手提同色字    双面满版印1000个  腾腾  自己写25号发",
    { customer: "腾腾", rows: [["25*32*10", "米白", "绿色", "绿色", 1000]] }],
  ["【小城良才】30/37，安格拉红本提，4500个印白双面，晓佳，最晚22号发货",
    { customer: "晓佳", rows: [["30*37*10", "安哥拉红", "白色", "安哥拉红", 4500]] }],
  ["【格兰口腔】竖版中号  白色袋子  印双色  5000个  京州，21号发货",
    { customer: "京州", rows: [["30*37*10", "白色", "双色", "", 5000]] }],
  ["【春天里】35*27 橘袋白字 // 天蓝白字 各10000个 双面印  （满版）   加急自己写22号发  腾腾",
    { customer: "腾腾", rows: [["35*27*10", "橘色", "白色", "", 10000], ["35*27*10", "天蓝", "白色", "", 10000]] }],
  ["【熙7】有底无侧  40宽  35高   12底  5000个  双面印刷  黑色字体  印刷完成后  切片42宽  88长   巩玉胜印  自己写31号发",
    { customer: "巩玉胜", peer: "巩玉胜", content: "熙7", rows: [["40*35*12", "", "黑色", "", 5000]] }],
  ["【ELLE】30*38  黑2千个  版图尺寸别动   版图距离顶口大概12厘米  如了，27号发货",
    { customer: "如了", handle: "普通提", rows: [["30*37*10", "黑色", "", "", 2000]] }],
];
for (const [line, expected] of cases) {
  assert.ok(looksLikePrintOrderLine(line), line);
  const actual = row(line);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${key}: ${line}`);
}
assert.ok(row("【仁济六合耳鼻堂】满版印刷 31号发货 30*38*10 双面印刷 2000个 大红 白字 【双面不同】   元宝").notes.includes("双面不同"));
assert.ok(row("【乐家美牙科】 不覆膜 30*37 玫红印白 双面满版印5000个 腾腾  加急28号发").notes.includes("不覆膜"));
assert.ok(row("【子墨新】：1号发货40*32*10双面印刷5000个安哥拉红 白字 咖啡提【双面相同】 加长提手50cm   元宝").notes.includes("加长提50cm"));
assert.ok(row("【科尔口腔 福清科尔福俱路】平口 25*35 双面印刷 2000个 橘黄 白字（双面不同）  松  自己写31号发").notes.includes("平口"));

// Ordinary customer messages keep the old recognition.
for (const text of ["30*38*10 红色100个、黑色 送货，印刷颜色：蓝色", "老板 30*38 白 3000个 印刷 明天要", "3037 红 500 个 黄松"]) assert.equal(looksLikePrintOrderLine(text), false, text);

// Customer: the short name at the end, never the 【】 content; one character matches only exactly.
const customers = [{ id: "C-SONG", name: "松" }, { id: "C-HS", name: "黄松" }, { id: "C-YB", name: "元宝包装", shortName: "元宝" }];
assert.equal(detectMessageCustomer("【金菊】30*38*10 双面印刷 3000个 橘黄白字（双面一样） 等通知印刷  松", customers).customerId, "C-SONG");
assert.equal(detectMessageCustomer("【蓝舒】：25号发货35*27*10双面印刷2000个安哥拉红 白字 咖啡提【双面相同】【元宝】", customers).customerId, "C-YB");
assert.deepEqual(detectMessageCustomer("【斐然】尺寸是35*27*10的   5000个双面  陈梦赛印", customers), { name: "陈梦赛", customerId: "" });

const rows = parseOrderText("【芽哩口腔7院】：31号发货 40*30*10 双面印刷 5000个宝石蓝白色（双面不同）  松", { customers, now });
assert.equal(rows.length, 1);
assert.deepEqual([rows[0].customerId, rows[0].printContent, rows[0].size, rows[0].color, rows[0].printColor, rows[0].qty, rows[0].latest, rows[0].print, rows[0].fulfillment, rows[0].orderType],
  ["C-SONG", "芽哩口腔7院", "40*30*10", "宝石蓝", "白色", 5000, "2026-10-31", "是", "快递快运", "custom_print"]);
const peer = parseOrderText("【斐然】尺寸是35*27*10的   5000个双面  陈梦赛印", { customers, now });
assert.deepEqual([peer[0].orderType, peer[0].customerId], ["external_print", ""]);
assert.match(peer[0].note, /陈梦赛送卷来加工，只印不制袋/u);
console.log(`print order line parser ok: ${cases.length} real workshop lines (content, short customer, peer processing, required date, sizes, bag/ink/handle colours, quantities).`);

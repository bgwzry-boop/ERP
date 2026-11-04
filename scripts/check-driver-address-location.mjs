import assert from "node:assert/strict";
import { createCustomerAddressCommandService, parseGeoPoint } from "../server/services/customerAddressCommandService.mjs";
import { buildRecordCustomerAddressLocationQuery, createLocalMasterDataImportTransactionRepository } from "../server/masterDataImportTransactionRepository.mjs";
import { getDriverNavigationOptions, getDriverNavigationUrl } from "../src/services/driverMobileApiClient.js";

// 负责人 2026-11-04：村里很多地方靠定位。第一次送到并拍送货照时记下手机定位，下次谁送都能直接导航。
assert.deepEqual(parseGeoPoint("22.817123,113.672456"), { latitude: 22.817123, longitude: 113.672456 });
assert.equal(parseGeoPoint("0,0"), null);
assert.equal(parseGeoPoint("定位未授权"), null);
assert.equal(parseGeoPoint("95,10"), null);

const service = createCustomerAddressCommandService({ buildOperationLog: (_w, input) => ({ id: "LOG", ...input }), now: () => new Date("2026-11-04T03:00:00Z") });
const workspace = () => ({
  masterDataImportTransactionRepository: createLocalMasterDataImportTransactionRepository(),
  customers: [{ id: "C1", name: "李记", addresses: [] }],
  customerAddresses: [
    { id: "A1", customerId: "C1", address: "虎门大道 36 号", isDefault: true },
    { id: "A2", customerId: "C1", address: "厚街某村 8 号" },
  ],
  fulfillments: [
    { id: "F-CHOSEN", customerId: "C1", customerSnapshot: { deliveryAddressId: "A2", deliveryAddressSource: "customer_address" } },
    { id: "F-OLD", customerId: "C1", customerSnapshot: {} },
    { id: "F-ONEOFF", customerId: "C1", customerSnapshot: { deliveryAddressSource: "order_one_off", address: "临时地址" } },
  ],
});
const ws = workspace();
const learnt = await service.learnLocationFromDelivery({ workspace: ws, fulfillmentId: "F-CHOSEN", body: { watermarkGeoPoint: "22.8171,113.6724" } });
assert.deepEqual(learnt, { recorded: true, addressId: "A2" }, "the address chosen for this delivery learns the location");
assert.deepEqual([ws.customerAddresses[1].latitude, ws.customerAddresses[1].longitude], [22.8171, 113.6724]);
const again = await service.learnLocationFromDelivery({ workspace: ws, fulfillmentId: "F-CHOSEN", body: { watermarkGeoPoint: "23.0,114.0" } });
assert.equal(again.reason, "already_located", "a known location is never overwritten by a later delivery");
assert.equal(ws.customerAddresses[1].latitude, 22.8171);
assert.deepEqual(await service.learnLocationFromDelivery({ workspace: ws, fulfillmentId: "F-OLD", body: { watermarkGeoPoint: "22.9,113.7" } }), { recorded: true, addressId: "A1" },
  "an older delivery without a chosen address teaches the customer's default address");
assert.equal((await service.learnLocationFromDelivery({ workspace: workspace(), fulfillmentId: "F-ONEOFF", body: { watermarkGeoPoint: "22.9,113.7" } })).reason, "address_not_found",
  "a one-off address is not a saved address, so nothing is learnt");
assert.equal((await service.learnLocationFromDelivery({ workspace: workspace(), fulfillmentId: "F-CHOSEN", body: { watermarkGeoPoint: "" } })).reason, "no_location");

const query = buildRecordCustomerAddressLocationQuery({ fulfillmentId: "F1", latitude: 22.8, longitude: 113.6, capturedAt: "2026-11-04T03:00:00Z" });
assert.match(query.text, /address\.latitude IS NULL AND address\.longitude IS NULL/, "Postgres never overwrites a known location");
assert.match(query.text, /<> 'order_one_off'/);
assert.match(query.text, /address\.customer_id = delivery\.customer_id/, "only the delivery's own customer address can be updated");

// Navigation: by location when known, by address text otherwise; 高德 / 百度 / 腾讯 to choose from.
const located = getDriverNavigationOptions({ address: "厚街某村 8 号", customerName: "李记", addressLatitude: 22.8171, addressLongitude: 113.6724 });
assert.deepEqual(located.map((item) => item.app), ["amap", "baidu", "tencent"]);
assert.ok(located.every((item) => item.located));
assert.match(located[0].url, /uri\.amap\.com\/navigation\?to=113\.6724,22\.8171,.*coordinate=wgs84/);
assert.match(located[1].url, /api\.map\.baidu\.com\/direction\?.*coord_type=wgs84/);
assert.match(located[2].url, /apis\.map\.qq\.com\/uri\/v1\/routeplan\?.*tocoord=22\.8171,113\.6724&coord_type=1/);
const byText = getDriverNavigationOptions({ address: "厚街某村 8 号", customerName: "李记" });
assert.ok(byText.every((item) => !item.located));
assert.equal(getDriverNavigationUrl({ address: "厚街某村 8 号", customerName: "李记" }), byText[0].url);
assert.deepEqual(getDriverNavigationOptions({ address: "地址待补" }), []);
console.log("Driver address location: learnt once from the delivery photo's GPS, never overwritten; navigation by location in 高德 / 百度 / 腾讯.");

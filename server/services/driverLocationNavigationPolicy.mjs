// 司机定位与多地图导航（负责人 2026-11-04 提出，不进第一批上线）。默认关闭：
//   ERP_DRIVER_LOCATION_NAVIGATION=on   打开——送达时把定位记到客户地址，司机路线页给出高德 / 百度 / 腾讯导航
//   未设置或 off                         关闭——不写定位，路线页保持原来的「打开导航」按地址搜索
// 数据库迁移 0059 照常执行；关闭时只是不写、不读这些定位字段。
export function isDriverLocationNavigationEnabled(env = process.env) {
  const value = String(env?.ERP_DRIVER_LOCATION_NAVIGATION ?? "").trim().toLowerCase();
  if (!value || value === "off") return false;
  if (value === "on") return true;
  throw new Error("ERP_DRIVER_LOCATION_NAVIGATION must be on or off.");
}

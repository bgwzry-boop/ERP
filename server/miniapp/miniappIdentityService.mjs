import { createHmac, timingSafeEqual } from "node:crypto";

import { MiniappApiError } from "./miniappApiError.mjs";

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function fingerprintWechatSubject(subject, pepper) {
  if (!subject || Buffer.byteLength(String(pepper || "")) < 32) {
    throw new MiniappApiError(503, "IDENTITY_NOT_CONFIGURED", "微信身份服务尚未配置");
  }
  return createHmac("sha256", pepper).update(String(subject)).digest("hex");
}

export function createMiniappAccessTokenService(options = {}) {
  const secret = String(options.secret || "");
  const ttlSeconds = Number(options.ttlSeconds || 7200);
  const now = options.now || (() => Date.now());
  if (Buffer.byteLength(secret) < 32) throw new Error("MINIAPP_SESSION_SECRET must contain at least 32 bytes");

  return {
    issue(binding) {
      const issuedAt = Math.floor(now() / 1000);
      const payload = {
        v: 1,
        bindingId: binding.id,
        customerId: binding.customerId,
        iat: issuedAt,
        exp: issuedAt + ttlSeconds,
      };
      const encoded = encode(payload);
      return { accessToken: `${encoded}.${sign(encoded, secret)}`, expiresIn: ttlSeconds };
    },

    verify(token) {
      const parts = String(token || "").split(".");
      if (parts.length !== 2) throw new MiniappApiError(401, "SESSION_INVALID", "登录状态无效，请重新进入小程序");
      const expected = Buffer.from(sign(parts[0], secret));
      const actual = Buffer.from(parts[1]);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        throw new MiniappApiError(401, "SESSION_INVALID", "登录状态无效，请重新进入小程序");
      }
      let payload;
      try {
        payload = decode(parts[0]);
      } catch {
        throw new MiniappApiError(401, "SESSION_INVALID", "登录状态无效，请重新进入小程序");
      }
      if (!payload.bindingId || !payload.customerId || Number(payload.exp) <= Math.floor(now() / 1000)) {
        throw new MiniappApiError(401, "SESSION_EXPIRED", "登录状态已过期，请重新进入小程序");
      }
      return payload;
    },
  };
}

export function createWechatCodeExchangeProvider(options = {}) {
  const appId = String(options.appId || "");
  const appSecret = String(options.appSecret || "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return {
    async exchange(code) {
      if (!appId || !appSecret || !fetchImpl) {
        throw new MiniappApiError(503, "WECHAT_LOGIN_NOT_CONFIGURED", "微信登录服务尚未配置");
      }
      const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
      url.searchParams.set("appid", appId);
      url.searchParams.set("secret", appSecret);
      url.searchParams.set("js_code", code);
      url.searchParams.set("grant_type", "authorization_code");
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new MiniappApiError(502, "WECHAT_LOGIN_FAILED", "微信登录暂时不可用，请稍后重试");
      const result = await response.json();
      if (!result.openid || result.errcode) {
        throw new MiniappApiError(401, "WECHAT_CODE_REJECTED", "微信登录凭证无效，请重新进入小程序");
      }
      return { openId: result.openid, unionId: result.unionid || "" };
    },
  };
}

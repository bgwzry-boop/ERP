const HANDSET_USER_AGENT_PATTERN = /Android.+Mobile|iPhone|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini|Mobile.+Firefox/i;

export function detectCompleteReviewRuntimeFamily(runtime = globalThis) {
  const runtimeNavigator = runtime?.navigator;
  const clientHintMobile = runtimeNavigator?.userAgentData?.mobile;

  if (typeof clientHintMobile === "boolean") {
    return clientHintMobile ? "mobile" : "desktop";
  }

  const userAgent = String(runtimeNavigator?.userAgent || "");
  if (HANDSET_USER_AGENT_PATTERN.test(userAgent)) return "mobile";

  const platform = String(runtimeNavigator?.platform || "");
  const maxTouchPoints = Number(runtimeNavigator?.maxTouchPoints || 0);
  const isDesktopClassIpad = platform === "MacIntel" && maxTouchPoints > 1;
  if (/iPad/i.test(userAgent) || isDesktopClassIpad) return "mobile";

  return "desktop";
}


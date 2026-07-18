export function getRuntimePasswordChangePresentation(user = {}) {
  const passwordExpired = String(user.passwordStatus ?? "").trim() === "password_expired";
  if (passwordExpired) {
    return {
      currentPasswordLabel: "当前密码",
      currentPasswordPlaceholder: "请输入当前密码",
      description: "密码已过期，请先更新密码后再进入业务系统。",
      submitLabel: "更新密码",
      submittingLabel: "正在更新",
      title: "密码已过期",
    };
  }
  return {
    currentPasswordLabel: "当前临时密码",
    currentPasswordPlaceholder: "请输入当前临时密码",
    description: "需先完成首次改密。",
    submitLabel: "保存新密码",
    submittingLabel: "正在保存",
    title: "设置新密码",
  };
}

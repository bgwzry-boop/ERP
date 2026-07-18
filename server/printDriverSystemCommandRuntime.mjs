import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";

export function runSystemPrinterCommand({ command, args, stdin, timeoutMs }) {
  return spawnSync(command, args, {
    input: stdin,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    shell: false,
  });
}

export function inspectCommandAvailability(systemPrinterCommand) {
  const command = String(systemPrinterCommand ?? "").trim();
  if (!command) {
    return {
      configured: false,
      executable: false,
      detail: "未配置命令，未检查可执行文件",
    };
  }
  const candidates = isAbsolute(command)
    ? [command]
    : String(process.env.PATH ?? "")
        .split(delimiter)
        .map((directory) => directory.trim())
        .filter(Boolean)
        .map((directory) => resolve(directory, command));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return {
        configured: true,
        executable: true,
        detail: "命令存在且当前进程可执行",
      };
    } catch {
      // Keep probing PATH candidates without exposing any candidate path.
    }
  }
  return {
    configured: true,
    executable: false,
    detail: "命令已配置但当前进程不可执行或未找到",
  };
}

export function inspectSpoolDirectory(commandBridgeSpoolDir) {
  const spoolDir = String(commandBridgeSpoolDir ?? "").trim();
  if (!spoolDir) {
    return {
      exists: false,
      writable: false,
      detail: "未配置 spool 状态目录",
    };
  }
  if (!existsSync(spoolDir)) {
    return {
      exists: false,
      writable: false,
      detail: "spool 目录尚未创建，真实接入前需预创建并校验权限",
    };
  }
  try {
    const stat = statSync(spoolDir);
    if (!stat.isDirectory()) {
      return {
        exists: true,
        writable: false,
        detail: "spool 目标存在但不是目录",
      };
    }
    accessSync(spoolDir, constants.R_OK | constants.W_OK);
    return {
      exists: true,
      writable: true,
      detail: "spool 目录存在且当前进程可读写",
    };
  } catch {
    return {
      exists: true,
      writable: false,
      detail: "spool 目录当前进程不可读写",
    };
  }
}

const defaultShutdownTimeoutMs = 25_000;

export function createGracefulShutdownController(options = {}) {
  const server = options.server;
  if (!server || typeof server.close !== "function") {
    throw new Error("A running HTTP server is required for graceful shutdown.");
  }

  const closeResources = options.closeResources ?? (async () => {});
  const timeoutMs = resolveShutdownTimeoutMs(options.timeoutMs);
  const logger = options.logger ?? console;
  const forceExit = options.forceExit ?? ((code) => process.exit(code));
  const setExitCode = options.setExitCode ?? ((code) => {
    process.exitCode = code;
  });
  const signalTarget = options.signalTarget ?? process;
  let shutdownPromise = null;
  const signalHandlers = new Map();

  function shutdown(signal = "manual") {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = new Promise((resolve) => {
      let finished = false;
      logger.info?.(`ERP API graceful shutdown started (${signal}).`);

      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        server.closeAllConnections?.();
        logger.error?.(`ERP API graceful shutdown exceeded ${timeoutMs}ms; forcing exit.`);
        forceExit(1);
        resolve({ status: "forced", signal, exitCode: 1 });
      }, timeoutMs);
      timeout.unref?.();

      server.close(async (closeError) => {
        if (finished) return;
        server.closeIdleConnections?.();
        let resourceError = null;
        try {
          await closeResources();
        } catch (error) {
          resourceError = error;
        }

        finished = true;
        clearTimeout(timeout);
        const error = closeError || resourceError;
        const exitCode = error ? 1 : 0;
        setExitCode(exitCode);
        if (error) {
          logger.error?.("ERP API graceful shutdown completed with an error.");
        } else {
          logger.info?.("ERP API graceful shutdown completed.");
        }
        resolve({ status: error ? "error" : "closed", signal, exitCode });
      });
    });

    return shutdownPromise;
  }

  function install(signals = ["SIGTERM", "SIGINT"]) {
    for (const signal of signals) {
      if (signalHandlers.has(signal)) continue;
      const handler = () => void shutdown(signal);
      signalHandlers.set(signal, handler);
      signalTarget.once(signal, handler);
    }
    return uninstall;
  }

  function uninstall() {
    for (const [signal, handler] of signalHandlers) {
      signalTarget.removeListener(signal, handler);
    }
    signalHandlers.clear();
  }

  return {
    install,
    shutdown,
    uninstall,
    timeoutMs,
  };
}

export function resolveShutdownTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1_000) return defaultShutdownTimeoutMs;
  return Math.min(120_000, Math.floor(parsed));
}

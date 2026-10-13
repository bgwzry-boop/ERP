export function createLazyApiClient(loadModule) {
  let modulePromise;

  function loadApiModule() {
    modulePromise ??= Promise.resolve().then(loadModule);
    return modulePromise;
  }

  return function lazyApiCall(exportName) {
    return async (...args) => {
      const apiModule = await loadApiModule();
      const apiMethod = apiModule?.[exportName];
      if (typeof apiMethod !== "function") {
        throw new TypeError(`Lazy API export is not callable: ${exportName}`);
      }
      return apiMethod(...args);
    };
  };
}

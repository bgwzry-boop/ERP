import { useEffect, useState } from "react";

const emptyOfficeScenarioData = Object.freeze({
  customers: Object.freeze([]),
  defaultSelections: Object.freeze({}),
  initialFulfillments: Object.freeze([]),
  initialInventories: Object.freeze([]),
  initialOrderLines: Object.freeze([]),
  initialRawMaterialInbounds: Object.freeze([]),
  initialStatements: Object.freeze([]),
  initialTodos: Object.freeze([]),
  sampleText: "",
});

export function useOfficeScenarioData(serverRequired) {
  const [scenarioState, setScenarioState] = useState(() => (
    serverRequired
      ? { data: emptyOfficeScenarioData, error: "" }
      : { data: null, error: "" }
  ));

  useEffect(() => {
    let active = true;
    if (serverRequired) {
      setScenarioState({ data: emptyOfficeScenarioData, error: "" });
      return () => {
        active = false;
      };
    }

    setScenarioState({ data: null, error: "" });
    import("../services/officeMockScenarioService.js")
      .then(({ loadOfficeWorkspace }) => {
        if (active) setScenarioState({ data: loadOfficeWorkspace(), error: "" });
      })
      .catch((error) => {
        if (active) {
          setScenarioState({
            data: null,
            error: error?.message ?? "本地演示数据加载失败",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [serverRequired]);

  return scenarioState;
}

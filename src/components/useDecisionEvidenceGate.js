import {useCallback, useRef, useState} from "react";

// The ref closes the same-event gap before React updates the disabled button.
export function useDecisionEvidenceGate() {
  const current = useRef(false);
  const [ready, setReady] = useState(false);
  const onReadinessChange = useCallback(value => {
    current.current = value === true;
    setReady(current.current);
  }, []);
  const isReady = useCallback(() => current.current, []);
  return {ready, onReadinessChange, isReady};
}

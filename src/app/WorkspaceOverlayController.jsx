import { lazy, Suspense } from "react";
import { hasOpenWorkspaceOverlay } from "./workspaceOverlayState.js";

const WorkspaceOverlays = lazy(() => import("./WorkspaceOverlayRoute.jsx"));

/** Defers all modal implementation and attachment styles until an overlay is open. */
export function WorkspaceOverlayController(props) {
  if (!hasOpenWorkspaceOverlay(props)) return null;
  return (
    <Suspense fallback={null}>
      <WorkspaceOverlays {...props} />
    </Suspense>
  );
}

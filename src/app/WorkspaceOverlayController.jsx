import { lazy, Suspense } from "react";

const WorkspaceOverlays = lazy(async () => {
  const [module] = await Promise.all([
    import("./WorkspaceOverlays.jsx"),
    import("../styles/features/attachments.css"),
  ]);
  return { default: module.WorkspaceOverlays };
});

/** Defers all modal implementation and attachment styles until an overlay is open. */
export function WorkspaceOverlayController(props) {
  const isOpen = Boolean(
    props.attachmentViewer
    || props.masterDataTemplatePanel
    || props.modal
    || props.orderActionModal,
  );
  if (!isOpen) return null;
  return (
    <Suspense fallback={null}>
      <WorkspaceOverlays {...props} />
    </Suspense>
  );
}

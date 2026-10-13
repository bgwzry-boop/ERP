export function hasOpenWorkspaceOverlay(props = {}) {
  return Boolean(
    props.attachmentViewer
    || props.masterDataTemplatePanel
    || props.modal
    || props.orderActionModal,
  );
}

import "../../styles/features/v1-status-base.css";
import "../../styles/features/v1-status.css";
import { createOfficeV1StatusActions } from "../createOfficeV1StatusActions.js";
import { V1StatusPage } from "../../features/v1-status/V1StatusPage.jsx";

export function V1StatusRoute({ actionController = {}, state = {}, ...props }) {
  const actions = createOfficeV1StatusActions(actionController).pageActions;
  return <V1StatusPage {...props} {...state} {...actions} />;
}

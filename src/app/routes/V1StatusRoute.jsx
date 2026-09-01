import "../../styles/features/v1-status-base.css";
import "../../styles/features/v1-status.css";
import { V1StatusPage } from "../../features/v1-status/V1StatusPage.jsx";

export function V1StatusRoute({ state = {}, actions = {}, ...props }) {
  return <V1StatusPage {...props} {...state} {...actions} />;
}

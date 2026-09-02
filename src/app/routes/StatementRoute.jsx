import "../../styles/features/statements.css";
import { StatementPage } from "../../features/statements/StatementPage.jsx";
import { createOfficeStatementActions } from "../createOfficeStatementActions.js";

export function StatementRoute({ actionController = {}, actions = {}, state = {} }) {
  const { statementAction } = createOfficeStatementActions(actionController);
  return <StatementPage {...state} {...actions} onAction={statementAction} />;
}

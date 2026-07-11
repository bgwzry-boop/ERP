import { StatusPill } from "../../components/ui.jsx";

export function V1StatusRoleTaskWorkspace({
  roleTaskBoard,
  roleTaskCategorySummaries,
  buildRoleTaskQuickActions,
}) {
  return (
    <>
          {roleTaskBoard ? (
            <section className="detail-section v1-workspace-panel v1-workspace-field v1-section-role_tasks">
              <h3>角色现场任务</h3>
              <div className="v1-role-task-summary">
                <span>任务 <strong>{roleTaskBoard.summary.taskCountLabel}</strong></span>
                <span>角色 <strong>{roleTaskBoard.summary.roleCountLabel}</strong></span>
                <span>发布门禁 <strong>{roleTaskBoard.summary.releaseTaskCount} 项</strong></span>
                <span>现场证据 <strong>{roleTaskBoard.summary.evidenceTaskCount} 项</strong></span>
                <span>签字/边界 <strong>{roleTaskBoard.summary.signoffTaskCount + roleTaskBoard.summary.boundaryTaskCount} 项</strong></span>
              </div>
              {roleTaskCategorySummaries.length ? (
                <div className="v1-role-category-grid">
                  {roleTaskCategorySummaries.map((category) => (
                    <div className="v1-role-category-card" data-role-task-category={category.key} key={category.key}>
                      <div className="v1-role-category-head">
                        <div>
                          <StatusPill tone={category.tone}>{category.title}</StatusPill>
                          <strong>{category.countLabel}</strong>
                        </div>
                        <span>{category.statusLabel}</span>
                      </div>
                      <p>{category.description}</p>
                      {category.firstTasks.length ? (
                        <div className="v1-role-category-preview">
                          {category.firstTasks.slice(0, 2).map((task) => (
                            <span key={`${category.key}-${task.id}`}>{task.title}</span>
                          ))}
                        </div>
                      ) : null}
                      {category.actions.length ? (
                        <div className="v1-role-category-actions">
                          {category.actions.map((action) => (
                            <button
                              className="ghost-button"
                              disabled={action.disabled}
                              key={action.key}
                              onClick={action.onClick}
                              type="button"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {roleTaskBoard.firstActions?.length ? (
                <div className="v1-role-first-actions">
                  <div className="v1-role-first-actions-head">
                    <strong>首批现场动作</strong>
                    <span>显示 {roleTaskBoard.firstActions.length}/{roleTaskBoard.summary.taskCount}</span>
                  </div>
                  <div className="v1-role-first-action-list">
                    {roleTaskBoard.firstActions.map((task) => {
                      const taskActions = buildRoleTaskQuickActions(task);
                      return (
                        <div className="v1-role-first-action-row" key={task.id}>
                          <div>
                            <StatusPill tone={task.type === "发布门禁" ? "danger" : task.type.includes("签字") || task.type.includes("边界") ? "warning" : "blue"}>
                              {task.type || "待办"}
                            </StatusPill>
                            <strong>{task.title}</strong>
                          </div>
                          <p>{task.group} / {task.action}</p>
                          <div className="v1-role-task-meta">
                            <span>{task.priority || "P0"}</span>
                            <span>{task.primaryRole || task.roles?.[0] || "待分派"}</span>
                            <span>{task.status || "pending"}</span>
                          </div>
                          {taskActions.length ? (
                            <div className="v1-role-first-action-buttons">
                              {taskActions.map((action) => (
                                <button
                                  className="ghost-button"
                                  disabled={action.disabled}
                                  key={action.key}
                                  onClick={action.onClick}
                                  type="button"
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="v1-role-task-list">
                {roleTaskBoard.roles.map((role) => (
                  <div className="v1-role-task-row" key={role.role}>
                    <div className="v1-role-task-head">
                      <strong>{role.role}</strong>
                      <span>显示 {role.tasks.length}/{role.taskCount} 项</span>
                    </div>
                    <div className="v1-role-task-meta">
                      <span>门禁 {role.releaseTaskCount}</span>
                      <span>证据 {role.evidenceTaskCount}</span>
                      <span>签字 {role.signoffTaskCount}</span>
                      <span>边界 {role.boundaryTaskCount}</span>
                    </div>
                    <div className="v1-role-task-items">
                      {role.tasks.slice(0, 4).map((task) => (
                        <div className="v1-role-task-item" key={`${role.role}-${task.id}`}>
                          <StatusPill tone={task.type === "发布门禁" ? "danger" : task.type.includes("签字") ? "warning" : "blue"}>
                            {task.type || "待办"}
                          </StatusPill>
                          <div>
                            <strong>{task.title}</strong>
                            <p>{task.group} / {task.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {role.taskCount > role.tasks.length ? (
                      <p className="v1-role-task-more">
                        还有 {role.taskCount - role.tasks.length} 项在交接包角色任务文件中，先处理上方首批现场动作和本角色预览。
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
    </>
  );
}

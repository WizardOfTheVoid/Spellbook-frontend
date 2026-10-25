export type ActionExecutionAccess = {
  canExecuteActions: boolean
  actionExecutionReason: string | null
}

export function actionExecutionIssue(access: Partial<ActionExecutionAccess> | null | undefined): string | null {
  return access?.canExecuteActions === true ? null : access?.actionExecutionReason || `Action access is unavailable.`
}

import { prepareAction } from '@spellbook/shared/actions/prepareAction'
import type { ActionContext, ActionRecipe, ActionTarget } from '@spellbook/shared/actions/actionTypes'
import type { HttpClient } from '../../api/http-client'
import type { ActionExecutionOptions } from '../../core/actionClient'

export class ActionHandler {
  constructor(private readonly http: Pick<HttpClient, `commands` | `executeAction`>) {}

  async execute(recipe: ActionRecipe, target: ActionTarget, context: ActionContext, options: ActionExecutionOptions) {
    const prepared = prepareAction(recipe, target, context)
    const result = await this.http.executeAction(this.http.commands.batch(prepared.commands), options)
    return { result, prepared }
  }
}

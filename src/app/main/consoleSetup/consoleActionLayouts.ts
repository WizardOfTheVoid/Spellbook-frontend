import type { CoreAction } from '../../shared/coreAction'
import { isKeyboardLayoutId, type ConsoleLayoutSelection } from '../../shared/keyboardLayout'

export class ConsoleActionLayouts {
  static prepare(action: CoreAction, selection: ConsoleLayoutSelection | null, probeId: string | null): CoreAction {
    return { ...action, commands: action.commands.map(command => {
      if (command.type !== `console`) return { ...command, presses: command.presses.map(press => ({ ...press })) }
      if (action.id === probeId && action.author === `user` && action.priority === `normal` && action.commands.length === 1
        && command.command === `ListPlayers` && command.expectClipboard === true && command.keyboardLayoutId === `detect`) return { ...command }
      if (!selection || !isKeyboardLayoutId(selection.layoutId)) throw new Error(`Console keyboard layout setup is required.`)
      return { ...command, keyboardLayoutId: selection.layoutId }
    }) }
  }
}

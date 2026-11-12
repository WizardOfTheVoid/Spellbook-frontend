type PlayerNavigation = { visit(action: () => Promise<boolean>): Promise<boolean> }

export async function visitSnapshotPlayer(navigation: PlayerNavigation, select: (subpage: `actions`) => Promise<boolean>): Promise<boolean> {
  let selected = false
  const completed = await navigation.visit(async () => {
    selected = await select(`actions`)
    return selected
  })
  return completed && selected
}

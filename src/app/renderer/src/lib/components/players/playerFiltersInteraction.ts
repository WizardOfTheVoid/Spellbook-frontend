export function createPlayerFiltersInteraction(
  read: () => boolean,
  write: (open: boolean) => void,
  trigger: () => HTMLElement | undefined,
) {
  return {
    toggle(): void { write(!read()) },
    outsidePointer(event: Pick<PointerEvent, `target`>, dialog: HTMLElement, close: () => void): void {
      const target = event.target as Node
      if (!dialog.contains(target) && !trigger()?.contains(target)) close()
    }
  }
}

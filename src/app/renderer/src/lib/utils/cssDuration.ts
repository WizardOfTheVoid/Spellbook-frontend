export function cssDuration(style: CSSStyleDeclaration, token: string): number {
  const value = style.getPropertyValue(token).trim()
  const amount = Number.parseFloat(value)
  return Number.isFinite(amount) ? Math.max(0, amount * (value.endsWith(`ms`) ? 1 : 1000)) : 0
}

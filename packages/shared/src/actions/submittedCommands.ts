import type { CommandSpan } from './actionTypes.js'

export function submittedCommands(spans: readonly CommandSpan[], sentCount: number) {
  const total = spans.reduce((sum, span) => sum + span.count, 0)
  if (!Number.isInteger(sentCount) || sentCount < 0 || sentCount > total) throw new RangeError(`Invalid submitted command count.`)
  return spans.filter(span => span.offset < sentCount).map(span => {
    const submittedCount = Math.min(span.count, sentCount - span.offset)
    return { ...span, submittedCount, complete: submittedCount === span.count }
  })
}

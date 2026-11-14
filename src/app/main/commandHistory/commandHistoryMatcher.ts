import type { CommandHistoryRow, ConsoleSubmission } from '../../shared/commandHistory/commandHistory'

export type FileHistoryObservation = {
  history: readonly string[]
  readStartedAtUtc: number
  readCompletedAtUtc: number
}

type TrackedRow = { row: CommandHistoryRow, observation: FileHistoryObservation, firstSeen: number, repeated: boolean }
const equal = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index])

export class CommandHistoryMatcher {
  recoveryReason = ``
  private history: readonly string[] | null = null
  private rows: TrackedRow[] = []
  private tentative: readonly string[] | null = null
  private readonly used = new Set<number>()
  private readonly matched = new Set<number>()
  private nextId = 0

  constructor(private readonly now: () => number = () => performance.now(),
    private readonly uncertain: (command: string) => boolean = () => false) {}

  reset(): void {
    this.history = null
    this.rows = []
    this.tentative = null
    this.used.clear()
    this.matched.clear()
    this.recoveryReason = ``
  }

  wasMatched(sequence: number): boolean { return this.matched.has(sequence) }

  accept(observation: FileHistoryObservation, receipts: readonly ConsoleSubmission[]): readonly CommandHistoryRow[] {
    const next = observation.history
    if (this.history === null) {
      this.baseline(observation, receipts)
    } else if (!equal(this.history, next)) {
      if (next.length < this.history.length && next.every((value, index) => value === this.history![index])) {
        return this.suspend(`History appears truncated; retaining the last complete read.`)
      }
      if (!this.advance(next, observation)) {
        if (this.tentative && equal(this.tentative, next)) {
          this.baseline(observation, receipts)
        } else {
          this.tentative = [...next]
          return this.suspend(`History was rewritten or reordered; waiting for a stable baseline.`)
        }
      }
    }
    this.recoveryReason = ``
    this.tentative = null
    this.rows = this.rows.map((item, index) => ({ ...item, row: { ...item.row, index: index + 1 } }))
    this.match(receipts)
    return this.snapshot()
  }

  private baseline(observation: FileHistoryObservation, receipts: readonly ConsoleSubmission[]): void {
    this.history = [...observation.history]
    this.rows = observation.history.map(command => this.track(command, observation, true))
    receipts.filter(receipt => Date.parse(receipt.submittedAtUtc) < observation.readStartedAtUtc && observation.history.includes(receipt.command))
      .forEach(receipt => this.used.add(receipt.sequence))
  }

  private advance(next: readonly string[], observation: FileHistoryObservation): boolean {
    const previous = this.history!
    if (new Set(previous).size === previous.length && new Set(next).size === next.length) {
      const positions = new Map(previous.map((command, index) => [command, index]))
      const retained: number[] = []
      for (const command of next) {
        const index = positions.get(command)
        if (index === undefined || index <= (retained.at(-1) ?? -1)) break
        retained.push(index)
      }
      const added = next.slice(retained.length)
      const moved = new Set(added.filter(command => positions.has(command)))
      const remaining = previous.filter(command => !moved.has(command))
      if (retained.length > 0 && equal(remaining.slice(-retained.length), next.slice(0, retained.length))) {
        this.rows = [...retained.map(index => this.rows[index]),
          ...added.map(command => this.track(command, observation, false, moved.has(command)))]
        this.history = [...next]
        return true
      }
    }
    let overlap = Math.min(previous.length, next.length)
    while (overlap > 0 && !equal(previous.slice(-overlap), next.slice(0, overlap))) overlap--
    if (overlap === 0 && previous.length > 0) return false
    this.rows = [...this.rows.slice(this.rows.length - overlap), ...next.slice(overlap).map(command => this.track(command, observation, false))]
    this.history = [...next]
    return true
  }

  private track(command: string, observation: FileHistoryObservation, historical: boolean, repeated = false): TrackedRow {
    const space = command.search(/\s/u)
    return { observation, firstSeen: this.now(), repeated, row: {
      id: ++this.nextId, index: 0, command, action: space < 0 ? command : command.slice(0, space),
      info: space < 0 ? `` : command.slice(space).trimStart(), origin: historical ? `unknown` : `pending`,
      reason: historical ? `Present when the monitoring baseline was established.` : `Waiting for submission evidence.`,
      observedAtUtc: historical ? null : observation.readCompletedAtUtc, submission: null
    } }
  }

  private suspend(reason: string): readonly CommandHistoryRow[] {
    this.recoveryReason = reason
    this.rows = this.rows.map(item => item.row.origin === `pending`
      ? { ...item, row: { ...item.row, origin: `unknown`, reason } } : item)
    return this.snapshot()
  }

  private match(receipts: readonly ConsoleSubmission[]): void {
    const available = receipts.filter(receipt => !this.used.has(receipt.sequence))
    const candidates = this.rows.filter(item => item.row.origin === `pending` || item.row.origin === `external`)
    const proposals: { item: TrackedRow, receipt: ConsoleSubmission }[] = []
    const considered = new Set<number>()
    for (const item of candidates) {
      const { readStartedAtUtc: start, readCompletedAtUtc: end } = item.observation
      const matching = available.filter(receipt => receipt.command === item.row.command && Date.parse(receipt.submittedAtUtc) <= end)
      const duringRead = matching.some(receipt => Date.parse(receipt.submittedAtUtc) >= start)
      const eligible = matching.filter(receipt => Date.parse(receipt.submittedAtUtc) < start &&
        receipt.ageMs <= 5_000 + this.now() - item.firstSeen)
      const collisions = candidates.filter(other => other.row.command === item.row.command && matching.some(receipt =>
        Date.parse(receipt.submittedAtUtc) <= other.observation.readCompletedAtUtc))
      matching.forEach(receipt => considered.add(receipt.sequence))
      if (duringRead || matching.length > 0 && (eligible.length !== 1 || collisions.length > 1)) {
        item.row = { ...item.row, origin: `unknown`, reason: `Submission timing or repeated command text is ambiguous.`, submission: null }
      } else if (eligible.length === 1) {
        proposals.push({ item, receipt: eligible[0] })
      } else if (this.uncertain(item.row.command)) {
        item.row = { ...item.row, origin: `unknown`, reason: `Older unmatched submission evidence is no longer available.` }
      } else if (this.now() - item.firstSeen >= 3_000) {
        item.row = { ...item.row, origin: item.repeated ? `unknown` : `external`, reason: item.repeated
          ? `An existing history entry moved; its execution cannot be confirmed without submission evidence.`
          : `No matching Core submission during uninterrupted monitoring.` }
      }
    }
    const assignments = [...this.rows.filter(item => item.row.origin === `spellbook` && item.row.submission)
      .map(item => ({ item, receipt: item.row.submission! })), ...proposals].sort((left, right) => left.item.row.index - right.item.row.index)
    const conflicts = new Set<TrackedRow>()
    assignments.forEach((assignment, index) => {
      if (index > 0 && assignment.receipt.sequence <= assignments[index - 1].receipt.sequence) {
        conflicts.add(assignment.item)
        conflicts.add(assignments[index - 1].item)
      }
    })
    for (const { item, receipt } of proposals) {
      item.row = { ...item.row, origin: `spellbook`, submission: receipt, reason: `Matched an actual Core console submission.` }
      this.matched.add(receipt.sequence)
    }
    for (const item of conflicts) {
      if (item.row.submission) this.matched.delete(item.row.submission.sequence)
      item.row = { ...item.row, origin: `unknown`, submission: null, reason: `History order does not match submission order.` }
    }
    considered.forEach(sequence => this.used.add(sequence))
    const retained = new Set(receipts.map(receipt => receipt.sequence))
    for (const sequence of this.used) if (!retained.has(sequence)) this.used.delete(sequence)
    for (const sequence of this.matched) if (!retained.has(sequence)) this.matched.delete(sequence)
  }

  private snapshot(): readonly CommandHistoryRow[] { return this.rows.map(item => item.row) }
}

export function createRangeScale(min: number, max: number, step: number, steps: readonly number[] = [], naturalStepSpacing = false, width = 0) {
	const values = [...new Set(steps.filter(Number.isFinite))].sort((a, b) => a - b)
	const custom = values.length > 0
	const natural = custom && naturalStepSpacing
	const lower = custom ? values[0] : min
	const upper = custom ? values[values.length - 1] : max
	const inputMin = custom ? 0 : min
	const inputMax = custom ? values.length - 1 : max
	const inputStep = custom ? 1 : step
	const tickValues = custom ? values : step !== 1 && step > 0 && Number.isFinite((max - min) / step)
		? Array.from({ length: Math.max(0, Math.floor((max - min) / step + 1e-9) + 1) }, (_, index) => Number((min + index * step).toFixed(10)))
		: []
	const clamp = (value: number, lower: number, upper: number) => Math.min(upper, Math.max(lower, value))
	const minimumGap = 22 // Three digits at the tick font size, plus 4px.
	const reserved = Math.max(0, values.length - 1) * minimumGap
	const available = Math.max(width, reserved)
	const positions = values.map((value, index) => {
		const ratio = upper === lower ? 0 : (value - lower) / (upper - lower)
		return available > 0 ? (index * minimumGap + ratio * (available - reserved)) / available * 100 : 0
	})

	function toInput(value: number): number {
		if (!custom) return value
		return values.reduce((closest, candidate, index) =>
			Math.abs(candidate - value) < Math.abs(values[closest] - value) ? index : closest, 0)
	}

	function fromInput(value: number): number {
		if (custom) return values[clamp(Math.round(value), inputMin, inputMax)]
		const stepped = min + Math.round((value - min) / step) * step
		return clamp(Number(stepped.toFixed(10)), min, max)
	}

	function progress(value: number): number {
		if (natural) {
			if (value <= lower || upper === lower) return 0
			if (value >= upper) return 100
			const index = values.findIndex(stop => stop >= value)
			const ratio = (value - values[index - 1]) / (values[index] - values[index - 1])
			return positions[index - 1] + ratio * (positions[index] - positions[index - 1])
		}
		return inputMax === inputMin ? 0 : clamp((toInput(value) - inputMin) / (inputMax - inputMin), 0, 1) * 100
	}

	return {
		inputMin, inputMax, inputStep,
		min: custom ? values[0] : min,
		max: custom ? values[values.length - 1] : max,
		tickValues,
		ticks: tickValues.map(progress),
		toInput, fromInput, progress,
		fromRatio: (ratio: number) => natural
			? values[positions.reduce((closest, position, index) => Math.abs(position - ratio * 100) < Math.abs(positions[closest] - ratio * 100) ? index : closest, 0)]
			: fromInput(inputMin + clamp(ratio, 0, 1) * (inputMax - inputMin)),
		snap: (value: number, allowOutOfStep = false) => allowOutOfStep
			? clamp(value, custom ? values[0] : min, custom ? values[values.length - 1] : max)
			: fromInput(toInput(value))
	}
}

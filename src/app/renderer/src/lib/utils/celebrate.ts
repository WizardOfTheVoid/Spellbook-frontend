import confetti from "canvas-confetti"

type Viewport = Pick<Window, `innerWidth` | `innerHeight`>
type ConfettiLauncher = (options: confetti.Options) => unknown
type CelebrationElement = Pick<HTMLElement, `getBoundingClientRect`>

export function celebrateElement(
	element: CelebrationElement,
	viewport: Viewport = window,
	launch: ConfettiLauncher = confetti,
): void {
	const bounds = element.getBoundingClientRect()
	void launch({
		particleCount: 72,
		spread: 62,
		startVelocity: 28,
		colors: [`#5865f2`, `#ffffff`, `#57f287`],
		disableForReducedMotion: true,
		zIndex: 50,
		origin: {
			x: (bounds.left + bounds.width / 2) / viewport.innerWidth,
			y: (bounds.top + bounds.height / 2) / viewport.innerHeight,
		},
	})
}

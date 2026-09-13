import type { Action } from "svelte/action";
import type { Snippet } from "svelte"
import { writable } from "svelte/store";
import { overlayPlacementPreference, type OverlayPlacement, type OverlayRect } from "$lib/utils/overlayPosition"

export type TooltipPlacement = OverlayPlacement;

export type TooltipSnapshot = {
	text: string;
	emphasis?: string;
	content?: Snippet
	detailed?: boolean
	placement: TooltipPlacement;
	anchor: OverlayRect;
};

export type TooltipConfig = string | {
	text: string;
	emphasis?: string;
	content?: Snippet
	detailed?: boolean
	placement?: TooltipPlacement;
};

export const tooltipState = writable<TooltipSnapshot | null>(null);

let activeNode: HTMLElement | null = null;

export const tooltip: Action<HTMLElement, TooltipConfig> = (node, config) => {
	let currentConfig = normalizeTooltipConfig(config);

	function show(): void {
		const text = currentConfig.text.trim();
		activeNode = node

		if (!text) {
			tooltipState.set(null)
			return;
		}

		tooltipState.set({
			text,
			...(currentConfig.emphasis ? { emphasis: currentConfig.emphasis } : {}),
			...(currentConfig.content ? { content: currentConfig.content } : {}),
			...(currentConfig.detailed !== undefined ? { detailed: currentConfig.detailed } : {}),
			placement: currentConfig.placement,
			anchor: snapshotRect(node.getBoundingClientRect()),
		});
	}

	function hide(): void {
		if (activeNode !== node) {
			return;
		}

		activeNode = null;
		tooltipState.set(null);
	}

	function refresh(): void {
		if (activeNode === node) {
			show();
		}
	}

	node.addEventListener("pointerenter", show);
	node.addEventListener("pointerleave", hide);
	node.addEventListener("focusin", show);
	node.addEventListener("focusout", hide);
	node.addEventListener("click", hide);
	window.addEventListener("resize", refresh);
	window.addEventListener("scroll", refresh, true);

	return {
		update(nextConfig) {
			currentConfig = normalizeTooltipConfig(nextConfig);
			refresh();
		},
		destroy() {
			hide();
			node.removeEventListener("pointerenter", show);
			node.removeEventListener("pointerleave", hide);
			node.removeEventListener("focusin", show);
			node.removeEventListener("focusout", hide);
			node.removeEventListener("click", hide);
			window.removeEventListener("resize", refresh);
			window.removeEventListener("scroll", refresh, true);
		},
	};
};

function normalizeTooltipConfig(config: TooltipConfig): Omit<TooltipSnapshot, `anchor`> {
	if (typeof config === "string") {
		return { text: config, placement: overlayPlacementPreference[0] }
	}

	return {
		text: config.text,
		...(config.emphasis?.trim() ? { emphasis: config.emphasis.trim() } : {}),
		...(config.content ? { content: config.content } : {}),
		...(config.detailed !== undefined ? { detailed: config.detailed } : {}),
		placement: config.placement ?? overlayPlacementPreference[0],
	};
}

function snapshotRect(rect: DOMRect): TooltipSnapshot["anchor"] {
	return {
		left: rect.left,
		top: rect.top,
		right: rect.right,
		bottom: rect.bottom,
		width: rect.width,
		height: rect.height,
	};
}

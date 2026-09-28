import { get } from "svelte/store";
import { getOverlayApi, type SnapshotLookupEvent, type SnapshotMatchTuning, type ToastRequest } from "$lib/core";
import { serverPlayers } from "$lib/stores/serverPlayersStore";
import {
	DEFAULT_MATCH_TUNING,
	matchPlayerFromText,
	type PlayerNameMatchResult,
} from "$lib/utils/playerNameMatch";
import type { PlayerState } from "$lib/types/playerState";

/**
 * Handles Quick Open Player snapshot results: match the OCR text against the last known server players and
 * either open the overlay on that player or raise a toast outside the overlay.
 */
export class SnapshotLookupController {
	constructor(private readonly onMatch: (player: PlayerState) => void) {}

	listen(): () => void {
		return getOverlayApi().onSnapshotLookup((event) => void this.handle(event));
	}

	private async handle(event: SnapshotLookupEvent): Promise<void> {
		if (!event.ok) {
			log("Receive snapshot failed", event.error ?? "unknown error");
			await toast({ message: event.error ?? "Snapshot failed.", level: "error" });
			return;
		}

		if (!event.hasText) {
			log("Receive snapshot", "no text found, nothing to match");
			await toast({ message: "No text found in the snapshot.", level: "warning" });
			return;
		}

		const tuning = event.matching ?? DEFAULT_MATCH_TUNING;
		const startedAtMs = Date.now();
		const result = matchPlayerFromText(event.lines, get(serverPlayers), tuning);
		logSearch(result, tuning, Date.now() - startedAtMs);

		if (!result.best || result.best.confidence < requiredConfidence(result, tuning)) {
			const message = noMatchMessage(result);
			log("Reject match", message);
			await toast({ message, level: "warning" });
			return;
		}

		const { player } = result.best;
		log("Open overlay", `${player.name} (${player.playfabId})`);
		this.onMatch(player);
		await getOverlayApi().show();
	}
}

function logSearch(result: PlayerNameMatchResult, tuning: SnapshotMatchTuning, elapsedMs: number): void {
	log(
		"Search players",
		`${result.candidateCount} candidate(s) against ${result.playerCount} player(s)`,
		elapsedMs,
	);

	for (const cleanup of result.cleanups) {
		log("Clean text", `"${cleanup.original}" -> ${cleanup.cleaned ? `"${cleanup.cleaned}"` : "rejected"}`);
	}

	log("Candidates", result.candidates.length > 0 ? result.candidates.join(" | ") : "none");

	for (const attempt of result.attempts) {
		const outcome =
			attempt.match ?
				`${attempt.match.player.name} at ${percent(attempt.match.confidence)} on "${attempt.match.matchedText}"`
			:	"no candidate";
		const verdict =
			attempt.match && attempt.match.confidence >= attempt.required ? "PASS" : "fail";

		log(`Pass ${attempt.strategy}`, `${verdict} - needs ${percent(attempt.required)}, got ${outcome}`);
	}

	if (!result.best) {
		log("Best candidate", "none");
		return;
	}

	log(
		"Best candidate",
		`${result.best.player.name} (${result.best.player.playfabId}) via ${result.best.strategy} at ${percent(result.best.confidence)}`,
	);
}

function requiredConfidence(result: PlayerNameMatchResult, tuning: SnapshotMatchTuning): number {
	if (result.best?.strategy === "prefix") return tuning.prefixConfidence;
	if (result.best?.strategy === "suffix") return tuning.suffixConfidence;
	if (result.best?.strategy === "word") return tuning.wordConfidence;

	return tuning.fullConfidence;
}

function noMatchMessage(result: PlayerNameMatchResult): string {
	if (result.playerCount === 0) return `No current server players are available yet.`;
	if (result.candidateCount === 0) return "No readable player name in the snapshot.";
	if (!result.best) return "No player match found.";

	return `No confident player match (${result.best.player.name} at ${percent(result.best.confidence)}).`;
}

function percent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function log(action: string, context: string, elapsedMs?: number): void {
	const timing = elapsedMs === undefined ? "" : `(${elapsedMs}ms) `;

	try {
		getOverlayApi().debugLog("Overlay/Snapshot", `${timing}${action}: ${context}`);
	} catch {
		// Diagnostics are best-effort and must never break the lookup.
	}
}

async function toast(request: ToastRequest): Promise<void> {
	try {
		await getOverlayApi().showToast(request);
	} catch {
		// The toast window is best-effort; a failed notification should never break the lookup.
	}
}

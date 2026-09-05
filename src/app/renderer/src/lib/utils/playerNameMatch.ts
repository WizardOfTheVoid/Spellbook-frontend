import type { PlayerState } from "$lib/types/playerState";
import type { SnapshotMatchTuning } from "$lib/core";
import { normalizePlayerName } from "./displayNames";

export type PlayerNameMatchStrategy = "full" | "prefix" | "suffix" | "word";

export type PlayerNameMatch = {
	player: PlayerState;
	confidence: number;
	matchedText: string;
	strategy: PlayerNameMatchStrategy;
};

export type PlayerNameMatchAttempt = {
	strategy: PlayerNameMatchStrategy;
	required: number;
	match: PlayerNameMatch | null;
};

export type PlayerNameCleanup = {
	original: string;
	cleaned: string | null;
};

export type PlayerNameMatchResult = {
	best: PlayerNameMatch | null;
	attempts: PlayerNameMatchAttempt[];
	cleanups: PlayerNameCleanup[];
	candidates: string[];
	candidateCount: number;
	playerCount: number;
};

const MIN_CANDIDATE_LENGTH = 3;

export const DEFAULT_MATCH_TUNING: SnapshotMatchTuning = {
	fullConfidence: 0.24,
	prefixLength: 4,
	prefixConfidence: 0.75,
	suffixLength: 4,
	suffixConfidence: 0.75,
	wordConfidence: 0.6,
	maxSpaces: 7,
};

/**
 * Scores OCR lines against known player names and returns the single best candidate.
 * Confidence is a 0-1 normalized edit-distance similarity. Passes run in order and the first to
 * clear its own bar wins: whole lines, leading letters, trailing letters, then individual words.
 */
export function matchPlayerFromText(
	lines: string[],
	players: PlayerState[],
	tuning: SnapshotMatchTuning = DEFAULT_MATCH_TUNING,
): PlayerNameMatchResult {
	const { lineCandidates, wordCandidates, cleanups } = toCandidates(lines, tuning.maxSpaces);
	const all = [...new Set([...lineCandidates, ...wordCandidates])];
	const names = players.map((player) => ({ player, names: playerNames(player) }));
	const attempts: PlayerNameMatchAttempt[] = [];
	const result = {
		attempts,
		cleanups,
		candidates: all,
		candidateCount: all.length,
		playerCount: players.length,
	};

	const passes: Array<{
		strategy: PlayerNameMatchStrategy;
		required: number;
		pool: string[];
		scorer: (name: string, candidate: string) => number;
	}> = [
		{
			strategy: "full",
			required: tuning.fullConfidence,
			pool: all,
			scorer: (name, candidate) => similarity(name, candidate),
		},
		{
			strategy: "prefix",
			required: tuning.prefixConfidence,
			pool: all,
			scorer: (name, candidate) => affixSimilarity(name, candidate, tuning.prefixLength, true),
		},
		{
			strategy: "suffix",
			required: tuning.suffixConfidence,
			pool: all,
			scorer: (name, candidate) => affixSimilarity(name, candidate, tuning.suffixLength, false),
		},
		{
			strategy: "word",
			required: tuning.wordConfidence,
			pool: wordCandidates,
			scorer: (name, candidate) => similarity(name, candidate),
		},
	];

	for (const pass of passes) {
		const match = score(names, pass.pool, pass.strategy, pass.scorer);
		attempts.push({ strategy: pass.strategy, required: pass.required, match });

		if (match && match.confidence >= pass.required) {
			return { ...result, best: match };
		}
	}

	// Nothing cleared its bar; the caller still reports the closest whole-name attempt.
	return { ...result, best: attempts[0]?.match ?? null };
}

function score(
	names: Array<{ player: PlayerState; names: string[] }>,
	candidates: string[],
	strategy: PlayerNameMatchStrategy,
	scorer: (name: string, candidate: string) => number,
): PlayerNameMatch | null {
	let best: PlayerNameMatch | null = null;

	for (const entry of names) {
		for (const name of entry.names) {
			for (const candidate of candidates) {
				const confidence = scorer(name, candidate);

				if (confidence > 0 && (!best || confidence > best.confidence)) {
					best = { player: entry.player, confidence, matchedText: candidate, strategy };
				}
			}
		}
	}

	return best;
}

function pickBest(left: PlayerNameMatch | null, right: PlayerNameMatch | null): PlayerNameMatch | null {
	if (!left) return right;
	if (!right) return left;

	return right.confidence > left.confidence ? right : left;
}

function affixSimilarity(name: string, candidate: string, length: number, fromStart: boolean): number {
	if (length < 1 || name.length < length || candidate.length < length) return 0;

	const nameAffix = fromStart ? name.slice(0, length) : name.slice(-length);
	const candidateAffix = fromStart ? candidate.slice(0, length) : candidate.slice(-length);

	return similarity(nameAffix, candidateAffix);
}

function toCandidates(
	lines: string[],
	maxSpaces: number,
): { lineCandidates: string[]; wordCandidates: string[]; cleanups: PlayerNameCleanup[] } {
	const lineCandidates = new Set<string>();
	const wordCandidates = new Set<string>();
	const cleanups: PlayerNameCleanup[] = [];

	for (const line of lines) {
		const cleaned = cleanLine(line, maxSpaces);
		cleanups.push({ original: line, cleaned });
		if (!cleaned) continue;

		lineCandidates.add(cleaned);

		for (const token of cleaned.split(" ")) {
			wordCandidates.add(token);
		}
	}

	return {
		lineCandidates: [...lineCandidates],
		wordCandidates: [...wordCandidates],
		cleanups,
	};
}

/** Strips symbols, drops fragments shorter than a name, and rejects lines left too fragmented. */
function cleanLine(line: string, maxSpaces: number): string | null {
	const words = normalize(line)
		.replace(/[^\p{L}\p{N}\s]/gu, "")
		.split(/\s+/u)
		.filter((word) => word.length >= MIN_CANDIDATE_LENGTH);

	if (words.length === 0) return null;

	return words.length - 1 > maxSpaces ? null : words.join(" ");
}

function playerNames(player: PlayerState): string[] {
	const sources = [
		player.name,
		player.normalizedName,
		player.dbLatestName,
		player.dbLatestNormalizedName,
	];
	const names = new Set<string>();

	for (const source of sources) {
		const original = source?.trim().toLowerCase();
		if (original) names.add(original);

		// The stored normalized form strips accents, so an OCR read without them still matches.
		const normalized = normalize(normalizePlayerName(source ?? ""));
		if (normalized) names.add(normalized);
	}

	return [...names];
}

function normalize(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function similarity(left: string, right: string): number {
	if (!left || !right) return 0;
	if (left === right) return 1;

	const longest = Math.max(left.length, right.length);

	return 1 - editDistance(left, right) / longest;
}

function editDistance(left: string, right: string): number {
	let previous = Array.from({ length: right.length + 1 }, (_value, index) => index);

	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		const current = [leftIndex];

		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
			current[rightIndex] = Math.min(
				current[rightIndex - 1] + 1,
				previous[rightIndex] + 1,
				previous[rightIndex - 1] + substitutionCost,
			);
		}

		previous = current;
	}

	return previous[right.length];
}

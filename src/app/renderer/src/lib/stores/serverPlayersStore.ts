import { writable } from "svelte/store";
import type { PlayerState } from "$lib/types/playerState";

/**
 * Last unfiltered player list enriched by the backend.
 * The snapshot lookup runs while the overlay is hidden, so it can only match this cached list.
 */
export const serverPlayers = writable<PlayerState[]>([]);

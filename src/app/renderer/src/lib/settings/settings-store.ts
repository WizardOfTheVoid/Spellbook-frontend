import { writable } from "svelte/store";
import { getOverlayApi } from "$lib/core";
import type { AppSettingsSnapshot, AppSettingsUpdate } from "$lib/core";
import { notifyError } from "$lib/notifications/notificationEvents";

export const settingsSnapshot = writable<AppSettingsSnapshot | null>(null);

export async function loadSettings(): Promise<AppSettingsSnapshot | null> {
	try {
		const snapshot = await getOverlayApi().getSettings();
		settingsSnapshot.set(snapshot);
		return snapshot;
	} catch (error) {
		notifyError(getErrorMessage(error), { dedupeKey: "settings:load" });
		return null;
	}
}

export async function updateSettings(
	update: AppSettingsUpdate,
): Promise<AppSettingsSnapshot | null> {
	try {
		const snapshot = await getOverlayApi().updateSettings(update);
		settingsSnapshot.set(snapshot);
		return snapshot;
	} catch (error) {
		notifyError(getErrorMessage(error), { dedupeKey: "settings:update" });
		return null;
	}
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Settings request failed.";
}
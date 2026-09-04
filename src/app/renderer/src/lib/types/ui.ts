import type { Tone } from "./tone";

export type ActivePage =
	| "dashboard"
	| "server"
	| "players"
	| "wanted"
	| "servers"
	| "profiles"
	| "notifications"
	| "account"
	| "teams"
	| "settings"
	| "admin";
export type LoadState = "idle" | "loading" | "ok" | "error";

export type ServerSummary = {
	serverExternalId: string | null;
	serverName: string;
	serverAddress: string | null;
	serverDisplayName: string;
	playerState: LoadState;
};

export type MenuItem = {
	label: string;
	icon?: string;
	tone?: Tone;
	disabled?: boolean;
	onSelect: () => void;
};

export type FilterChip = {
	id: string;
	label: string;
	icon?: string;
	tone?: Tone;
	disabled?: boolean;
	tooltip?: string;
};

export type FormOption = {
	value: string;
	label: string;
	description?: string;
	disabled?: boolean;
};

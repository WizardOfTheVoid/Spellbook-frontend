<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { loadOffenses } from "$lib/components/players/offenses/offenseActions";
	import {
		timezone,
		loadTimezone,
		formatActionTime,
	} from "$lib/settings/timezone";
	import { get } from "svelte/store";
	import { getCoreApi } from "$lib/core";
	import { authState } from "$lib/auth/user";
	import {
		fetchActiveServerProfile,
		fetchPlayerProfile,
	} from "$lib/utils/serverProfilesApi";
	import { executeProfileAction } from "$lib/utils/profileCommandRunner";
	import type { ActionRun } from "@spellbook/shared/actions/actionTypes";
	import type { ServerProfileAction, PlayerAction } from "$lib/core";
	import { profileDuplicateBan } from "@spellbook/shared/playerBans";
	import { playerStatusNow } from "$lib/stores/playerStatusClock";
	import { actionsApi } from "$lib/utils/actionsApi";
	import { dispatchRequest } from "./requestDispatch";
	import { openOffenseRemoval } from "$lib/components/players/offenses/offenseRemovalState";
	import Button from "$lib/components/ui/Button.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	export let embedded = false;

	type Option = {
		gameServerId: number;
		name: string;
		profileId: number;
		actions: ServerProfileAction[];
	};
	let options: Option[] = [];
	let hasActiveBan = false;
	let activeBans: PlayerAction[] = [];
	let lookupKey = ``;
	let lookupTimer: ReturnType<typeof setTimeout> | undefined;
	$: if (lookupKey !== `${serverId}:${playfabId.trim()}`) {
		lookupKey = `${serverId}:${playfabId.trim()}`;
		hasActiveBan = false;
		activeBans = [];
		clearTimeout(lookupTimer);
		const key = lookupKey;
		lookupTimer = setTimeout(() => void loadBanState(key), 250);
	}
	onDestroy(() => clearTimeout(lookupTimer));
	async function loadBanState(key: string) {
		if (!serverId || !playfabId.trim()) return;
		try {
			const profile = await fetchPlayerProfile(playfabId.trim());
			const options = await loadOffenses(profile.player.id);
			if (key === lookupKey) {
				activeBans = options.activeBans;
				hasActiveBan = activeBans.some(
					(ban) => ban.gameServerId === Number(serverId),
				);
			}
		} catch {
			if (key === lookupKey) hasActiveBan = false;
		}
	}
	let recent: ActionRun[] = [];
	async function loadRecent() {
		recent = await actionsApi<ActionRun[]>(`requests`);
	}
	onMount(() => {
		void loadRecent().catch((value) => (error = String(value)));
	});
	let serverId = ``;
	let actionKey = ``;
	let playfabId = ``;
	let expirySeconds = ``;
	let expiresAt: string | null = null;
	let requestKey = crypto.randomUUID();
	let run: ActionRun | null = null;
	let error = ``;
	let busy = false;
	let localResult = ``;
	$: server = options.find((item) => item.gameServerId === Number(serverId));
	$: availableActions = (server?.actions ?? []).filter(
		(action) =>
			hasActiveBan ||
			!action.commands.some((command) => command.commandType === `unban`),
	);
	$: action = availableActions.find((item) => item.actionKey === actionKey);
	$: duplicateIssue =
		action ?
			profileDuplicateBan(
				action.commands,
				activeBans,
				Number(serverId),
				new Date($playerStatusNow),
			)
		:	null;
	onMount(() => {
		void loadTimezone().catch((value) => (error = String(value)));
		void actionsApi<Option[]>(`options`)
			.then((value) => (options = value))
			.catch((value) => (error = String(value)));
	});
	$: validExpiry =
		expirySeconds === `` ||
		(Number.isInteger(Number(expirySeconds)) && Number(expirySeconds) >= 1);
	function resetRequest() {
		run = null;
		localResult = ``;
		expiresAt = null;
		requestKey = crypto.randomUUID();
	}
	function setExpiry(value: string) {
		expirySeconds = value;
		resetRequest();
	}
	async function send() {
		if (!server || !action || busy || !validExpiry || duplicateIssue) return;
		busy = true;
		try {
			if (action.commands.some((command) => command.commandType === `unban`)) {
				const profile = await fetchPlayerProfile(playfabId);
				openOffenseRemoval({
					playerId: profile.player.id,
					playfabId,
					name: profile.player.latestName ?? playfabId,
					gameServerId: server.gameServerId,
					profile: {
						profileId: server.profileId,
						actionKey: action.actionKey!,
					},
				});
				return;
			}
			const snapshot = await getCoreApi().currentGameSnapshot();
			await dispatchRequest(
				snapshot,
				server.gameServerId,
				async (snapshot) => {
					const active = await fetchActiveServerProfile(snapshot.externalId);
					const profile = active.profiles?.find(
						(profile) => profile.profile.id === server.profileId,
					);
					const localAction = profile?.actions.find(
						(action) => action.actionKey === actionKey && action.isEnabled,
					);
					const admin = get(authState).user;
					if (!localAction || !admin)
						throw new Error(
							`Selected action is not available in your active profile.`,
						);
					const player =
						action.actionDomain === `player` ?
							snapshot.players.find((player) => player.playfabId === playfabId)
						:	undefined;
					if (
						action.actionDomain === `player` &&
						!player &&
						!localAction.commands.some(
							(command) => command.commandType === `unban`,
						)
					)
						throw new Error(`Player is absent from the current roster.`);
					const dbProfile =
						action.actionDomain === `player` ?
							await fetchPlayerProfile(playfabId)
						:	undefined;
					const result = await executeProfileAction(localAction, {
						admin,
						serverName: snapshot.serverName ?? server.name,
						gameServer: active.gameServer,
						variables: active.variables,
						dbProfile,
						player:
							player ??
							(dbProfile ?
								{
									index: 0,
									playfabId,
									name: dbProfile.player.latestName ?? playfabId,
									rawLine: ``,
								}
							:	undefined),
					});
					localResult = result.message;
					if (!result.ok) throw new Error(result.message);
				},
				async () => {
					if (expirySeconds)
						expiresAt ??= new Date(
							Date.now() + Number(expirySeconds) * 1000,
						).toISOString();
					run = await actionsApi<ActionRun>(`request`, {
						requestKey,
						gameServerId: server.gameServerId,
						profileId: server.profileId,
						actionKey,
						target:
							action.actionDomain === `server` ?
								{ type: `server` }
							:	{ type: `player`, playfabId },
						...(expiresAt ? { expiresAt } : {}),
					});
				},
			);
			error = ``;
		} catch (value) {
			error = String(value);
		} finally {
			busy = false;
		}
	}
	async function refresh() {
		if (run) run = await actionsApi<ActionRun>(`status`, { id: run.id });
	}
</script>

<section class="request-panel" class:request-panel--embedded={embedded}>
	<PanelHeader
		title="Action request"
		variant={embedded ? `section` : `panel`}
		eyebrow={embedded ? null : `Server actions`}
	/>
	{#if error}<p role="alert">{error}</p>{/if}
	<Select
		label="Server"
		value={serverId}
		options={options.map((item) => ({
			value: String(item.gameServerId),
			label: item.name,
		}))}
		onChange={(value) => {
			serverId = value;
			actionKey = ``;
			playfabId = ``;
			resetRequest();
		}}
	/>
	<Select
		label="Action"
		value={actionKey}
		options={availableActions.map((item) => ({
			value: item.actionKey ?? ``,
			label: item.label,
		}))}
		onChange={(value) => {
			actionKey = value;
			resetRequest();
		}}
	/>
	{#if server?.actions.some((item) => item.actionDomain === `player`)}<Input
			label="Player PlayFab ID"
			value={playfabId}
			onChange={(value) => {
				playfabId = value;
				resetRequest();
			}}
		/>{/if}
	<div class="request-panel__expiry">
		<Select
			label="Request expiry"
			hint="Leave empty to use the default."
			value={expirySeconds === `` ? ``
			: [`30`, `120`, `300`, `600`].includes(expirySeconds) ? expirySeconds
			: `custom`}
			options={[
				{ value: ``, label: `Server default` },
				{ value: `30`, label: `30 seconds` },
				{ value: `120`, label: `2 minutes` },
				{ value: `300`, label: `5 minutes` },
				{ value: `600`, label: `10 minutes` },
				{ value: `custom`, label: `Custom` },
			]}
			onChange={(value) => setExpiry(value === `custom` ? `` : value)}
		/>
		<Input
			label="Expires after (seconds)"
			type="number"
			value={expirySeconds}
			min={1}
			step={1}
			hint="Leave empty to use the server default."
			error={validExpiry ? null : `Enter a positive whole number.`}
			onChange={setExpiry}
		/>
	</div>
	{#if action}<p>
			{action.label} on {server?.name}{action.actionDomain === `player` ?
				` for ${playfabId || `a selected player`}`
			:	``}. This can submit real game commands.
		</p>{/if}
	{#if duplicateIssue}<p role="status">{duplicateIssue}</p>{/if}
	<Button
		label="Send request"
		variant="primary"
		disabled={busy ||
			Boolean(duplicateIssue) ||
			!validExpiry ||
			!action ||
			Boolean(run) ||
			Boolean(localResult) ||
			(action.actionDomain === `player` && !playfabId)}
		onClick={() => void send()}
	/>
	<Button
		label="Refresh recent requests"
		onClick={() => void loadRecent().catch((value) => (error = String(value)))}
	/>
	{#each recent as item (item.id)}<p>
			#{item.id} / server {item.gameServerId} / {item.status}{item.result ?
				` / ${item.result.sentCommands} commands submitted`
			:	``}
		</p>{/each}
	{#if localResult}<p>{localResult}</p>{/if}
	{#if run}<p>
			Run #{run.id}: {run.status} · expires {formatActionTime(
				run.expiresAt,
				$timezone,
			)} ({$timezone})
		</p>
		<Button
			label="Refresh result"
			onClick={() => void refresh().catch((value) => (error = String(value)))}
		/>{/if}
</section>

<style>
	.request-panel {
		display: grid;
		gap: var(--gutter-md);
		padding: var(--gutter-lg);
		align-content: start;
	}
	.request-panel--embedded {
		padding: 0;
	}
	.request-panel__expiry {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--gutter-md);
	}
</style>

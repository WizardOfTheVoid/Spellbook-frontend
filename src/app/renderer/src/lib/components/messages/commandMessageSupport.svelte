<script lang="ts">
	import { onMount } from "svelte";
	import { getAdminName } from "@spellbook/shared/adminName.js";
	import { isMessageCommand } from "@spellbook/shared/actions/actionMessage.js";
	import { contextualMessageKeys } from "@spellbook/shared/actions/tagTypeDefinitions.js";
	import { authState } from "$lib/auth/user";
	import { currentServer } from "$lib/gameState/currentServerStore";
	import type {
		ServerProfileCommand,
		ServerVariableDefinition,
	} from "$lib/core";
	import { resolveMessageTemplate } from "$lib/utils/messageTags";
	import VariableTagPicker from "$lib/components/profiles/VariableTagPicker.svelte";
	import MessagePreview from "./messagePreview.svelte";
	import { tagTypes } from "./tagTypesStore";
	import { timezone, loadTimezone } from "$lib/settings/timezone"
	import { messageLegendItems, exampleMessageFacts } from "./messageLegend";
	import {
		messageExampleSource,
		renderMessagePreview,
		messagePreviewCount,
	} from "./messageExamples";

	export let command: ServerProfileCommand;
	export let commands: ServerProfileCommand[];
	export let variables: ServerVariableDefinition[] = [];
	export let playerAction = true;
	export let personal = false;
	export let characterCount: string | null = null;
	export let onSelect: (tag: string) => void;
	let error = ``;

	onMount(() => {
		void Promise.all([tagTypes.load(), loadTimezone()]).catch((value) => {
			error =
				value instanceof Error ? value.message : `Could not load definitions.`;
		});
	});
	$: active = $currentServer.activeProfile;
	$: server = active?.gameServer ?? null;
	$: source = messageExampleSource(commands, command);
	$: serverVariables = active?.variables ?? [];
	$: context = {
		...exampleMessageFacts,
		timezone: $timezone,
		admin: getAdminName($authState.user, `Example admin`),
		serverName: server?.displayName || server?.name || `Example server`,
		serverSlot: server?.maxPlayers ?? exampleMessageFacts.serverSlot,
		clanName: server?.clanName ?? ``,
		clanTag: server?.clanTag ?? ``,
		player:
			playerAction ? { name: `Samwise`, playfabId: `PLAYER_1` } : undefined,
		offenses: 3,
		variables: [
			...serverVariables.filter(
				(variable) =>
					![`adminsay_prefix`, `serversay_prefix`].includes(variable.key),
			),
			...[`adminsay_prefix`, `serversay_prefix`].map((key) => ({
				key,
				value:
					personal ? `[SB]` : (
						serverVariables
							.find((variable) => variable.key === key)
							?.value.trim() || `[SB]`
					),
			})),
		],
		tagDefinitions: $tagTypes,
	};
	$: tagContext = {
		...context,
		user: context.player?.name,
		playfab: context.player?.playfabId,
		offenses: `3`,
		duration:
			(
				(source?.commandType === `ban` && source.offenseType === `hacker`) ||
				source?.durationHours === 999999
			) ?
				`MAX`
			:	String(source?.durationHours ?? ``),
		actionType: source?.commandType,
		offenseType: source?.offenseType ?? undefined,
	};
	$: tags = [
		...messageLegendItems($tagTypes, tagContext, {
			player: playerAction,
			authoring: true,
		}),
		...variables
			.filter((row) => !contextualMessageKeys.has(row.key))
			.map((row) => ({
				tag: `[${row.key}]`,
				name: row.label,
				tooltip: `Value configured under Servers → Variables`,
				group: `Server variables`,
				example: resolveMessageTemplate(`[${row.key}]`, tagContext),
			})),
	];
	$: preview = renderMessagePreview(command, context, source);
	$: characterCount = messagePreviewCount(command.message, preview);
</script>

{#if isMessageCommand(command.commandType) || [`warn`, `ban`, `incremental_ban`, `kick`].includes(command.commandType)}
	<MessagePreview
		kind={[`ban`, `incremental_ban`, `kick`].includes(command.commandType) ?
			`reason`
		: command.commandType === `admin_message` ? `admin`
		: `server`}
		message={preview}
		count={characterCount}
		sample
	/>
{/if}
{#if error}<p role="status">Default definitions shown. {error}</p>{/if}

<VariableTagPicker {tags} {onSelect} />

<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import {
		defaultTagDefinitions,
		definedMessageValues,
		type TagTypeDefinition,
		type TagDefinitionGroup,
	} from "@spellbook/shared/actions/tagTypeDefinitions.js";
	import { authState } from "$lib/auth/user";
	import { tagTypes } from "$lib/components/messages/tagTypesStore";
	import { unsavedChanges } from "$lib/utils/unsavedChanges";
	import { notifySuccess } from "$lib/notifications/notificationEvents";
	import Input from "$lib/components/ui/Input.svelte";
	import Tabs from "$lib/components/ui/tabs.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import Button from "$lib/components/ui/Button.svelte";

	let drafts: TagTypeDefinition[] = [];
	let group: TagDefinitionGroup = `tag`;
	let busy = false;
	let loaded = false;
	let error = ``;
	const groups = [
		{ value: `tag`, label: `Tags & variants` },
		{ value: `action`, label: `Action wording` },
		{ value: `offense`, label: `Offense wording` },
	];
	const seed = (row: TagTypeDefinition) =>
		defaultTagDefinitions.find(
			(item) => item.group === row.group && item.slug === row.slug,
		)!;
	const saved = (row: TagTypeDefinition) =>
		$tagTypes.find(
			(item) => item.group === row.group && item.slug === row.slug,
		);
	const changed = (row: TagTypeDefinition) =>
		JSON.stringify(row) !== JSON.stringify(saved(row));
	const unregister = unsavedChanges.register(() => drafts.some(changed));
	onDestroy(unregister);
	onMount(() => {
		if ($authState.user?.isSuperadmin) void load();
	});
	$: examples = definedMessageValues(
		{
			user: `Samwise`,
			admin: `Admin`,
			playfab: `PLAYER_1`,
			duration: `24`,
			offenses: `3`,
			action_type: `ban`,
			offense_type: `verbal_abuse`,
			server_name: `Duel Server`,
			clan_name: `Templars`,
			clan_tag: `TT`,
		},
		drafts,
	);

	async function load() {
		busy = true;
		error = ``;
		try {
			drafts = (await tagTypes.load()).map((row) => ({ ...row }));
			loaded = true;
		} catch (value) {
			error =
				value instanceof Error ? value.message : `Could not load definitions.`;
		} finally {
			busy = false;
		}
	}
	async function reload() {
		if (await unsavedChanges.canLeave()) await load();
	}
	function change(row: TagTypeDefinition, values: Partial<TagTypeDefinition>) {
		drafts = drafts.map((item) =>
			item === row ? { ...item, ...values } : item,
		);
	}
	async function save(row: TagTypeDefinition) {
		busy = true;
		error = ``;
		try {
			const result = await tagTypes.save(row);
			change(row, result);
			notifySuccess(`Tag definition saved.`);
		} catch (value) {
			error =
				value instanceof Error ? value.message : `Could not save definition.`;
		} finally {
			busy = false;
		}
	}
</script>

{#if $authState.user?.isSuperadmin}
	<section class="tag-types" aria-label="Tag definitions">
		<Tabs
			label="Definitions"
			items={groups}
			value={group}
			onChange={(value) => (group = value as TagDefinitionGroup)}
		>
			<PanelHeader
				variant="section"
				title={groups.find((item) => item.value === group)?.label ??
					`Definitions`}
			>
				<svelte:fragment slot="trailing"
					><Button
						label={busy ? `Loading…` : `Reload`}
						icon="fa-rotate"
						disabled={busy}
						onClick={() => void reload()}
					/></svelte:fragment
				>
			</PanelHeader>
			<p class="tag-types__description">
				Manage tag labels, optional formats, and the wording used in message
				previews and sent messages.
			</p>
			{#if error}<p role="alert">{error}</p>{/if}
			{#if loaded}
				{#each drafts.filter((row) => row.group === group) as row (`${row.group}:${row.slug}`)}
					<details class="tag-type">
						<summary
							><code>{row.group === `tag` ? `[${row.slug}]` : row.slug}</code
							><span>{row.name}</span>{#if changed(row)}<small>Unsaved</small
								>{/if}</summary
						>
						<fieldset disabled={busy} class="grid-stack gap-1">
							<Input
								label="Slug"
								value={row.slug}
								disabled
								hint="System key; existing messages and records depend on this value."
							/>
							<Input
								label="Name"
								value={row.name}
								maxlength={64}
								onChange={(name) => change(row, { name })}
							/>
							{#if row.group === `tag`}
								{#if seed(row).alt}
									<Checkbox
										label="Alternative format (_alt)"
										description="Ordinal count: 1st, 2nd, 3rd, 11th."
										checked={row.alt === `ordinal`}
										onChange={(enabled) =>
											change(row, { alt: enabled ? `ordinal` : null })}
									/>
								{/if}
								{#if seed(row).pastTense}
									<Checkbox
										label="Past tense (_pt)"
										description="Uses the preceding or current moderation action's past-tense wording."
										checked={row.pastTense === `action`}
										onChange={(enabled) =>
											change(row, { pastTense: enabled ? `action` : null })}
									/>
								{/if}
								<div class="examples">
									<p>
										<code>[{row.slug}]</code> → {examples[row.slug] || `Empty`}
									</p>
									{#if row.alt}<p>
											<code>[{row.slug}_alt]</code> → {examples[
												`${row.slug}_alt`
											] || `Empty`}
										</p>{/if}
									{#if row.pastTense}<p>
											<code>[{row.slug}_pt]</code> → {examples[
												`${row.slug}_pt`
											] || `Empty`}
										</p>{/if}
								</div>
							{:else if row.group === `action`}
								<Input
									label="Past tense"
									value={row.pastTense ?? ``}
									maxlength={64}
									hint="Example: banned. Leave empty to use the message's fallback."
									onChange={(pastTense) =>
										change(row, { pastTense: pastTense || null })}
								/>
								<p class="examples">Samwise was {row.pastTense || `…`}.</p>
							{:else}
								<p class="examples">Offense type: {row.name}</p>
							{/if}
							<div class="grid-cluster gap-1">
								<Button
									label="Save"
									disabled={busy || !changed(row) || !row.name.trim()}
									onClick={() => void save(row)}
								/>
								<Button
									label="Discard changes"
									disabled={busy || !changed(row)}
									onClick={() => change(row, saved(row)!)}
								/>
							</div>
						</fieldset>
					</details>
				{/each}
			{/if}
		</Tabs>
	</section>
{/if}

<style lang="scss">
	.tag-types {
		min-width: 0;
		display: grid;
		gap: var(--gutter-lg);
	}
	.tag-types__description {
		margin: 0;
		color: var(--color-light-secondary);
		font-size: var(--font-size-sm);
	}
	.tag-type {
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
	}
	summary {
		display: flex;
		gap: var(--gutter-md);
		cursor: pointer;
		align-items: baseline;
	}
	summary code {
		color: var(--color-accent-primary);
	}
	small {
		color: var(--color-accent-tertiary);
	}
	fieldset {
		border: 0;
		padding: var(--gutter-md) 0 0;
		margin: 0;
	}
	.examples {
		color: var(--color-light-secondary);
		font-size: var(--font-size-sm);
	}
	.examples p {
		margin: 0;
	}
</style>

<script lang="ts">
	import { onDestroy } from "svelte"
	import type { ProfileOwner, ProfileOwnerOption, ServerProfileGraph, ServerProfileSummary } from "$lib/core"
	import { User } from "$lib/auth/user"
	import { fetchProfileSummaries, fetchServerProfile } from "$lib/utils/serverProfilesApi"
	import ConfirmModal from "$lib/components/ui/ConfirmModal.svelte"
	import Select from "$lib/components/ui/Select.svelte"

	export let mode: `create` | `restore`
	export let owner: ProfileOwner
	export let owners: ProfileOwnerOption[]
	export let onSelect: (source: ServerProfileGraph | null) => void
	export let onCancel: () => void

	let source = `empty`
	let teamKey = ``
	let profileKey = ``
	let profiles: ServerProfileSummary[] = []
	let loading = false
	let submitting = false
	let error = ``
	let revision = 0
	let active = true
	const sourceOptions = [
		{ value: `empty`, label: `Empty profile` },
		{ value: `team`, label: `From team profile` },
		{ value: `default`, label: `From Default profile` }
	]
	$: teams = owners.filter(option => option.type === `team` && User.Ability.can(`read`, option))
	$: teamOptions = teams.map(team => ({ value: `${team.id}`, label: team.name }))
	$: profileOptions = profiles.map(summary => ({ value: `${summary.profile.id}`, label: summary.profile.name }))
	$: ready = source !== `team` || Boolean(teamKey && profileKey)
	onDestroy(() => {
		active = false
		revision += 1
	})

	function selectSource(value: string): void {
		revision += 1
		source = value
		teamKey = ``
		profileKey = ``
		profiles = []
		loading = false
		error = ``
	}

	async function selectTeam(value: string): Promise<void> {
		teamKey = value
		profileKey = ``
		profiles = []
		error = ``
		const request = ++revision
		loading = true
		try {
			const loaded = await fetchProfileSummaries({ type: `team`, id: Number(value) })
			if (!active || request !== revision) return
			profiles = loaded.filter(summary => !summary.profile.isDefault && summary.profile.owner.type === `team`)
		} catch (cause) {
			if (active && request === revision) error = cause instanceof Error ? cause.message : `Could not load team profiles.`
		} finally {
			if (active && request === revision) loading = false
		}
	}

	async function confirm(): Promise<void> {
		if (!ready || loading || submitting) return
		if (source === `empty`) {
			onSelect(null)
			return
		}
		const request = ++revision
		submitting = true
		error = ``
		try {
			const sourceOwner: ProfileOwner = source === `team` ? { type: `team`, id: Number(teamKey) } : owner
			const profileId = source === `team` ? Number(profileKey)
				: (await fetchProfileSummaries(sourceOwner)).find(summary => summary.profile.isDefault)?.profile.id
			if (!active || request !== revision) return
			if (!profileId) throw new Error(`Default profile is unavailable. Refresh and try again.`)
			const loaded = await fetchServerProfile(sourceOwner, profileId)
			if (active && request === revision) onSelect(loaded)
		} catch (cause) {
			if (active && request === revision) error = cause instanceof Error ? cause.message : `Could not load the source profile.`
		} finally {
			if (active && request === revision) submitting = false
		}
	}
</script>

<ConfirmModal
	title={mode === `create` ? `Make a new profile` : `Restore profile`}
	message={mode === `create` ? `Start empty or copy actions from an existing profile.`
		: `Replace all actions and commands. Profile details and claimed servers stay as they are. Changes apply when you save.`}
	icon="fa-layer-group" iconType="light"
	confirmLabel={submitting ? `Loading…` : mode === `create` ? `Create draft` : `Replace actions`}
	confirmTone={mode === `create` ? `primary` : `danger`}
	cancelLabel="Cancel" confirmDisabled={!ready || loading || submitting}
	manageOverlayState onConfirm={() => void confirm()} {onCancel}
>
	<Select inlineMenu label="Start from" options={sourceOptions} value={source} disabled={submitting} onChange={selectSource} />
	{#if source === `team`}
		<Select inlineMenu label="Team" options={teamOptions} value={teamKey} placeholder="Select team" disabled={submitting} onChange={value => void selectTeam(value)} />
		{#if teamKey}
			<Select inlineMenu label="Profile" options={profileOptions} value={profileKey} placeholder={loading ? `Loading profiles…` : `Select profile`} disabled={loading || submitting} onChange={value => profileKey = value} />
		{/if}
		{#if teams.length === 0}<small>No readable team profiles are available.</small>
		{:else if teamKey && !loading && !error && profiles.length === 0}<small>This team has no profiles to copy.</small>{/if}
	{/if}
	{#if error}<p role="alert">{error}</p>{/if}
</ConfirmModal>

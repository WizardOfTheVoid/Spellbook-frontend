<script lang="ts">
	import type { AdminTeamSummary, CoreCallResult, TeamMemberRecord } from "$lib/core"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
	import { unwrap } from "$lib/utils/apiResult"
	import TeamDetail from "$lib/components/account/TeamDetail.svelte"
	import EmptyState from "$lib/components/ui/EmptyState.svelte"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import ListRow from "$lib/components/ui/ListRow.svelte"
	import SearchField from "$lib/components/ui/SearchField.svelte"

	export let active = false
	export let selectedTeamId: number | null = null
	export let onSelectedTeam: (teamId: number | null) => void

	let teams: AdminTeamSummary[] = []
	let members: TeamMemberRecord[] = []
	let memberOptions: TeamMemberRecord[] = []
	let search = ""
	let loaded = false
	let loading = false
	let busy = false
	let loadingOptions = false
	let loadedTeamId: number | null = null

	$: selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null
	$: normalizedSearch = search.trim().toLocaleLowerCase()
	$: filteredTeams = normalizedSearch
		? teams.filter((team) => [team.name, team.ownerDisplayName, team.id.toString()].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
		: teams
	$: if (active && !loaded) void loadTeams()
	$: if (active && selectedTeamId !== null && loadedTeamId !== selectedTeamId) void loadMembers(selectedTeamId)

	async function loadTeams(): Promise<void> {
		loading = true
		try {
			teams = await unwrap<AdminTeamSummary[]>(await window.chivServer.admin.teams.list(), "Teams request failed.")
			loaded = true
		} catch (error) {
			notifyError(message(error, "Teams request failed."), { dedupeKey: "admin:teams" })
		} finally {
			loading = false
		}
	}

	async function loadMembers(teamId: number): Promise<void> {
		loading = true
		try {
			members = await unwrap<TeamMemberRecord[]>(await window.chivServer.admin.teams.members(teamId), "Members request failed.")
			loadedTeamId = teamId
		} catch (error) {
			notifyError(message(error, "Members request failed."))
		} finally {
			loading = false
		}
	}

	async function loadMemberOptions(): Promise<void> {
		if (!selectedTeamId) return
		loadingOptions = true
		try {
			memberOptions = await unwrap<TeamMemberRecord[]>(await window.chivServer.teams.memberOptions(selectedTeamId), "Available users request failed.")
		} catch (error) {
			notifyError(message(error, "Available users request failed."))
		} finally {
			loadingOptions = false
		}
	}

	async function addMember(user: TeamMemberRecord): Promise<void> {
		if (!selectedTeamId) return
		await runMutation(
			() => window.chivServer.teams.addMember(selectedTeamId!, user.userId),
			`${user.displayName} added to the team.`,
			"Add member failed.",
		)
		await loadMemberOptions()
	}

	async function removeMember(userId: number): Promise<void> {
		if (!selectedTeamId) return
		await runMutation(
			() => window.chivServer.teams.removeMember(selectedTeamId!, userId),
			"Member removed.",
			"Remove member failed.",
		)
	}

	async function setPermission(member: TeamMemberRecord, action: string, enabled: boolean): Promise<void> {
		if (!selectedTeamId) return
		const permissions = new Set(member.permissions)
		if (enabled) permissions.add(action)
		else permissions.delete(action)
		await runMutation(
			() => window.chivServer.teams.setPermissions(selectedTeamId!, member.userId, [...permissions]),
			"Permissions updated.",
			"Permission update failed.",
		)
	}

	async function runMutation(request: () => Promise<CoreCallResult>, success: string, fallback: string): Promise<void> {
		if (!selectedTeamId) return
		busy = true
		try {
			await unwrap<unknown>(await request(), fallback)
			await Promise.all([loadMembers(selectedTeamId), loadTeams()])
			notifySuccess(success)
		} catch (error) {
			notifyError(message(error, fallback))
		} finally {
			busy = false
		}
	}

	function selectTeam(teamId: number): void {
		members = []
		memberOptions = []
		loadedTeamId = null
		onSelectedTeam(teamId)
	}

	function message(error: unknown, fallback: string): string {
		return error instanceof Error ? error.message : fallback
	}
</script>

{#if selectedTeamId !== null}
	<TeamDetail
		{members}
		{memberOptions}
		canAdmin={true}
		{busy}
		{loadingOptions}
		onLoadOptions={loadMemberOptions}
		onAdd={addMember}
		onRemove={(userId) => void removeMember(userId)}
		onPermission={(member, action, enabled) => void setPermission(member, action, enabled)}
	/>
{:else}
	<div class="admin-teams grid-stack gap-100">
		<div class="admin-teams__toolbar">
			<SearchField bind:value={search} placeholder="Search teams" label="Teams" />
			<IconButton icon="fa-rotate" ariaLabel="Refresh teams" disabled={loading} onClick={() => { loaded = false; void loadTeams() }} />
		</div>
		{#each filteredTeams as team (team.id)}
			<ListRow
				title={team.name}
				subtitle={`Owned by ${team.ownerDisplayName} · ${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}`}
				onClick={() => selectTeam(team.id)}
			>
				<svelte:fragment slot="trailing"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></svelte:fragment>
			</ListRow>
		{:else}
			<EmptyState title={loading ? "Loading teams" : "No teams"} message={loading ? "Fetching teams." : "No teams match this search."} />
		{/each}
	</div>
{/if}

<style lang="scss">
	.admin-teams__toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: var(--gutter-sm); }
</style>

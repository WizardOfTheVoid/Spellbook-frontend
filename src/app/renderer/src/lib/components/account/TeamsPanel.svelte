<script lang="ts">
	import ConfirmModal from "$lib/components/ui/ConfirmModal.svelte"
	import Tile from "$lib/components/ui/Tile.svelte"
	import TileGrid from "$lib/components/ui/TileGrid.svelte"
	import JoinTeamModal from "./JoinTeamModal.svelte"
	import TeamRequests from "./TeamRequests.svelte"
	import { getCoreErrorMessage, type TeamMemberRecord, type TeamRecord } from "$lib/core"
	import { authState, User } from "$lib/auth/user";
	import { unwrap } from "$lib/utils/apiResult";
	import {
		notifyError,
		notifySuccess,
	} from "$lib/notifications/notificationEvents";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import ListRow from "$lib/components/ui/ListRow.svelte";
	import DiscordTeamTile from "./DiscordTeamTile.svelte"
	import TeamDetail from "./TeamDetail.svelte";
	import { applyTeamNavigationRequest } from "./teamPanelNavigation"
	import DeleteTeamButton from "./DeleteTeamButton.svelte"

	export let hidden = false;
	export let isActive = false;
	export let requestedTeamView: `requests` | null = null
	export let onManageProfiles: (teamId: number) => void
	export let requestedTeamId: number | null = null
	export let requestedTeamRequestId: number | null = null
	export let onRequestedTeamHandled: (requestId: number, error?: unknown) => void = () => {}

	let modal: `create` | `join` | `remove` | null = null
	let removingMember: TeamMemberRecord | null = null
	let teamView: `members` | `requests` = `members`
	let teams: TeamRecord[] = [];
	let members: TeamMemberRecord[] = [];
	let memberOptions: TeamMemberRecord[] = [];
	let selectedTeamId: number | null = null;
	let teamName = "";
	let loaded = false;
	let busy = false;
	let loadingOptions = false;
	let loadingTeams = false
	let handlingRequestedTeam = false
	let teamLoadError: unknown = null
	let teamsRevision = 0
	$: selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
	$: canAdmin =
		selectedTeam ?
			User.Ability.can("admin", { type: "team", id: selectedTeam.id })
		:	false;
	$: if (
		isActive
		&& requestedTeamId === null
		&& !loaded
		&& !loadingTeams
		&& !teamLoadError
	) void loadTeams();
	$: if (
		isActive
		&& !loadingTeams
		&& !handlingRequestedTeam
		&& requestedTeamId !== null
		&& requestedTeamRequestId !== null
	) {
		void applyRequestedTeam()
	}

	async function loadTeams(): Promise<void> {
		const revision = ++teamsRevision
		loadingTeams = true
		teamLoadError = null
		try {
			const loadedTeams = await unwrap<TeamRecord[]>(
				await window.chivServer.teams.list(),
				"Teams request failed.",
			);
			if (revision !== teamsRevision) return
			teams = loadedTeams
			User.Ability.setTeams(teams);
			if (selectedTeamId && !teams.some((team) => team.id === selectedTeamId)) {
				selectedTeamId = null;
			}
			if (selectedTeamId) await loadMembers()
			loaded = true
		} catch (value) {
			if (revision !== teamsRevision) return
			loaded = false
			teamLoadError = value
			if (requestedTeamId === null) {
				notifyError(message(value, "Teams request failed."), {
					dedupeKey: "teams:list",
				});
			}
		} finally {
			if (revision === teamsRevision) loadingTeams = false
		}
	}

	async function applyRequestedTeam(): Promise<void> {
		if (
			requestedTeamId === null
			|| requestedTeamRequestId === null
			|| handlingRequestedTeam
		) return
		const teamId = requestedTeamId
		const requestId = requestedTeamRequestId
		const requestedView = requestedTeamView
		handlingRequestedTeam = true
		try {
			await applyTeamNavigationRequest(teamId, {
				isLoaded: () => loaded,
				load: async () => {
					await loadTeams()
					if (teamLoadError) throw teamLoadError
				},
				hasTeam: candidateId => teams.some(team => team.id === candidateId),
				select: selectTeam,
			})
			if (!isCurrentRequest(teamId, requestId)) {
				if (selectedTeamId === teamId) closeTeam()
				return
			}
			if (requestedView === `requests`) {
				if (!User.Ability.can(`admin`, { type: `team`, id: teamId })) throw new Error(`Team admin permission is required.`)
				teamView = `requests`
			}
			onRequestedTeamHandled(requestId)
		} catch (error) {
			if (isCurrentRequest(teamId, requestId)) {
				onRequestedTeamHandled(requestId, error)
			}
		} finally {
			handlingRequestedTeam = false
		}
	}

	function isCurrentRequest(teamId: number, requestId: number): boolean {
		return requestedTeamId === teamId && requestedTeamRequestId === requestId
	}

	async function loadMembers(): Promise<void> {
		if (!selectedTeamId) {
			members = [];
			return;
		}
		const teamId = selectedTeamId
		const result = await window.chivServer.teams.members(teamId)
		if (selectedTeamId !== teamId) return
		if ((result.status === 403 || result.status === 404) && selectedTeamId === teamId) {
			closeTeam()
			loaded = false
			throw new Error(getCoreErrorMessage(result, `This team is no longer available.`))
		}
		members = await unwrap<TeamMemberRecord[]>(
			result,
			"Members request failed.",
		);
	}

	async function loadMemberOptions(): Promise<void> {
		if (!selectedTeamId || !canAdmin) return;
		loadingOptions = true;
		try {
			memberOptions = await unwrap<TeamMemberRecord[]>(
				await window.chivServer.teams.memberOptions(selectedTeamId),
				"Available users request failed.",
			);
		} catch (value) {
			notifyError(message(value, "Available users request failed."));
		} finally {
			loadingOptions = false;
		}
	}

	async function createTeam(): Promise<void> {
		if (!teamName.trim() || busy) return;
		busy = true;
		try {
			const team = await unwrap<TeamRecord>(
				await window.chivServer.teams.create(teamName),
				"Team create failed.",
			);
			teamName = "";
			modal = null
			selectedTeamId = team.id;
			await loadTeams();
			await loadMembers();
			notifySuccess("Team created.");
		} catch (value) {
			notifyError(message(value, "Team create failed."));
		} finally {
			busy = false;
		}
	}

	async function selectTeam(teamId: number): Promise<void> {
		const previousTeamId = selectedTeamId
		selectedTeamId = teamId;
		teamView = `members`
		memberOptions = [];
		try {
			await loadMembers()
		} catch (error) {
			if (selectedTeamId !== null) selectedTeamId = previousTeamId
			throw error
		}
	}

	function closeTeam(): void {
		selectedTeamId = null;
		teamView = `members`
		members = [];
		memberOptions = [];
	}

	async function handleDeleted(teamId: number): Promise<void> {
		teamsRevision += 1
		if (selectedTeamId === teamId) closeTeam()
		loaded = false
		await loadTeams()
	}

	async function addMember(user: TeamMemberRecord): Promise<void> {
		if (!selectedTeamId) return;
		try {
			await unwrap<unknown>(
				await window.chivServer.teams.addMember(selectedTeamId, user.userId),
				"Add member failed.",
			);
			await Promise.all([loadMembers(), loadMemberOptions()]);
			notifySuccess(`${user.displayName} added to the team.`);
		} catch (value) {
			notifyError(message(value, "Add member failed."));
		}
	}

	async function removeMember(userId: number): Promise<void> {
		if (!selectedTeamId || busy) return;
		busy = true;
		try {
			await unwrap<unknown>(
				await window.chivServer.teams.removeMember(selectedTeamId, userId),
				"Remove member failed.",
			);
			await loadMembers();
			notifySuccess("Member removed.");
			modal = null
			removingMember = null
		} catch (value) {
			notifyError(message(value, "Remove member failed."));
		} finally {
			busy = false;
		}
	}

	async function setPermission(
		member: TeamMemberRecord,
		action: string,
		enabled: boolean,
	): Promise<void> {
		if (!selectedTeamId) return;
		busy = true;
		const permissions = new Set(member.permissions);
		if (enabled) permissions.add(action);
		else permissions.delete(action);
		try {
			await unwrap<unknown>(
				await window.chivServer.teams.setPermissions(
					selectedTeamId,
					member.userId,
					[...permissions],
				),
				"Permission update failed.",
			);
			notifySuccess(`Permissions saved for ${member.displayName}.`)
			await loadMembers();
		} catch (value) {
			notifyError(message(value, "Permission update failed."));
		} finally {
			busy = false;
		}
	}

	function message(value: unknown, fallback: string): string {
		return value instanceof Error ? value.message : fallback;
	}
</script>

<section {hidden} class="panel-view teams-panel" aria-label="My teams">
	<PanelHeader
		title={teamView === `requests` ? `Join requests` : selectedTeam?.name ?? "My teams"}
		eyebrow={selectedTeam ? "Team" : "Account"}
		leadingIcon={selectedTeam ? "fa-arrow-left" : null}
		leadingLabel={teamView === `requests` ? `Back to team` : `Back to teams`}
		onLeading={selectedTeam ? () => { if (teamView === `requests`) teamView = `members`
			else closeTeam() } : null}
	>
		<svelte:fragment slot="subtitle">
			{#if selectedTeam}<small
					>{members.length} {members.length === 1 ? "member" : "members"}</small
				>{/if}
		</svelte:fragment>
		<svelte:fragment slot="trailing">
			{#if !selectedTeam}
				<IconButton
					icon="fa-rotate"
					ariaLabel="Refresh teams"
					disabled={busy}
					onClick={loadTeams}
				/>
			{/if}
		</svelte:fragment>
	</PanelHeader>

	{#if selectedTeam}
		<div class="teams-detail panel-subview grid-stack gap-100">
			{#if selectedTeam.ownerUserId === $authState.user?.id || canAdmin || User.is(`superadmin`)}
				<DeleteTeamButton team={selectedTeam} onDeleted={handleDeleted} />
			{/if}
			<TileGrid columns={teamView === `requests` ? 1 : 2}>
				{#if teamView === `members`}<Tile title="Manage team profiles" icon="fa-sliders" subtitle={`Profiles shared by ${selectedTeam.name}`} onClick={() => onManageProfiles(selectedTeam!.id)} />{/if}
				{#if canAdmin}{#key selectedTeam.id}<TeamRequests teamId={selectedTeam.id} bind:view={teamView} onChanged={loadMembers} />{/key}{/if}
			</TileGrid>
			{#if teamView === `members`}
			{#if canAdmin}
				{#key selectedTeam.id}
					<DiscordTeamTile teamId={selectedTeam.id} />
				{/key}
			{/if}
			<TeamDetail
				{members}
				{memberOptions}
				{canAdmin}
				{busy}
				{loadingOptions}
				onLoadOptions={loadMemberOptions}
				onAdd={addMember}
				onRemove={(userId) => { removingMember = members.find(member => member.userId === userId) ?? null
					modal = `remove` }}
				onPermission={(member, action, enabled) =>
					void setPermission(member, action, enabled)}
			/>
			{/if}
		</div>
	{:else}
		<div class="teams-list panel-subview grid-stack gap-100">
			<p class="team-guidance">If you are part of a clan, talk to your leader for an invite</p>
			<TileGrid>
				<Tile title="Create team" icon="fa-plus" subtitle="Bring your admins together" onClick={() => modal = `create`} />
				<Tile title="Join team" icon="fa-users" subtitle="Find your clan or community" onClick={() => modal = `join`} />
			</TileGrid>

			{#each teams as team (team.id)}
				<ListRow
					title={team.name}
					subtitle={team.ownerUserId === $authState.user?.id ?
						"Owner"
					:	team.permissions.join(", ") || "Member"}
					onClick={() => void selectTeam(team.id)}
				>
					<svelte:fragment slot="trailing"
						><i class="fa-solid fa-chevron-right" aria-hidden="true"
						></i></svelte:fragment
					>
				</ListRow>
			{:else}
				<EmptyState
					title="No teams"
					message="Create a team to share server profiles."
				/>
			{/each}
		</div>
	{/if}

</section>

{#if modal === `create`}
	<ConfirmModal title="Create team" message="Give your team a name." icon="fa-users" iconType="light" confirmLabel="Create team" confirmTone="primary" cancelLabel="Cancel" busyLabel="Creating..." {busy} confirmDisabled={!teamName.trim()} manageOverlayState onConfirm={() => void createTeam()} onCancel={() => modal = null}>
		<form on:submit|preventDefault={() => void createTeam()}><Input label="Name" value={teamName} maxlength={100} disabled={busy} onChange={value => teamName = value} /></form>
	</ConfirmModal>
{:else if modal === `join`}
	<JoinTeamModal onClose={() => modal = null} />
{:else if modal === `remove` && removingMember}
	<ConfirmModal title="Remove member?" message={`Are you sure you want to remove ${removingMember.displayName} from ${selectedTeam?.name}?`} icon="fa-user-minus" iconType="light" confirmLabel="Remove member" cancelLabel="Cancel" busyLabel="Removing..." {busy} manageOverlayState onConfirm={() => void removeMember(removingMember!.userId)} onCancel={() => modal = null} />
{/if}

<style lang="scss">
	.team-guidance { margin: 0; color: var(--color-light-secondary); line-height: 1.6; }
	.teams-panel {
		height: 100%;
		padding: var(--panel-padding);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
	}
	.teams-list,
	.teams-detail {
		min-height: 0;
		overflow: auto;
	}

	:global(.panel-header__identity > small) {
		color: var(--color-light-tertiary);
	}
</style>

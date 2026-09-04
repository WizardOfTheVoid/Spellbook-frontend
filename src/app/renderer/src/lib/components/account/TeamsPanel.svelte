<script lang="ts">
	import type { TeamMemberRecord, TeamRecord } from "$lib/core"
	import { authState, User } from "$lib/auth/user";
	import { unwrap } from "$lib/utils/apiResult";
	import {
		notifyError,
		notifySuccess,
	} from "$lib/notifications/notificationEvents";
	import Button from "$lib/components/ui/Button.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import ListRow from "$lib/components/ui/ListRow.svelte";
	import DiscordTeamTile from "./DiscordTeamTile.svelte"
	import TeamDetail from "./TeamDetail.svelte";
	import { applyTeamNavigationRequest } from "./teamPanelNavigation"

	export let hidden = false;
	export let isActive = false;
	export let requestedTeamId: number | null = null
	export let requestedTeamRequestId: number | null = null
	export let onRequestedTeamHandled: (requestId: number, error?: unknown) => void = () => {}

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
		loadingTeams = true
		teamLoadError = null
		try {
			teams = await unwrap<TeamRecord[]>(
				await window.chivServer.teams.list(),
				"Teams request failed.",
			);
			User.Ability.setTeams(teams);
			if (selectedTeamId && !teams.some((team) => team.id === selectedTeamId)) {
				selectedTeamId = null;
			}
			if (selectedTeamId) await loadMembers()
			loaded = true
		} catch (value) {
			loaded = false
			teamLoadError = value
			if (requestedTeamId === null) {
				notifyError(message(value, "Teams request failed."), {
					dedupeKey: "teams:list",
				});
			}
		} finally {
			loadingTeams = false
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
		members = await unwrap<TeamMemberRecord[]>(
			await window.chivServer.teams.members(selectedTeamId),
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
		if (!teamName.trim()) return;
		busy = true;
		try {
			const team = await unwrap<TeamRecord>(
				await window.chivServer.teams.create(teamName),
				"Team create failed.",
			);
			teamName = "";
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
		memberOptions = [];
		try {
			await loadMembers()
		} catch (error) {
			selectedTeamId = previousTeamId
			throw error
		}
	}

	function closeTeam(): void {
		selectedTeamId = null;
		members = [];
		memberOptions = [];
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
		if (!selectedTeamId) return;
		busy = true;
		try {
			await unwrap<unknown>(
				await window.chivServer.teams.removeMember(selectedTeamId, userId),
				"Remove member failed.",
			);
			await loadMembers();
			notifySuccess("Member removed.");
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
		title={selectedTeam?.name ?? "My teams"}
		eyebrow={selectedTeam ? "Team" : "Account"}
		leadingIcon={selectedTeam ? "fa-arrow-left" : null}
		leadingLabel="Back to teams"
		onLeading={selectedTeam ? closeTeam : null}
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
				onRemove={(userId) => void removeMember(userId)}
				onPermission={(member, action, enabled) =>
					void setPermission(member, action, enabled)}
			/>
		</div>
	{:else}
		<div class="teams-list panel-subview grid-stack gap-100">
			<div class="team-create">
				<Input
					label="New team"
					value={teamName}
					maxlength={100}
					disabled={busy}
					onChange={(value) => (teamName = value)}
				/>
				<Button
					label="Create"
					icon="fa-plus"
					variant="primary"
					disabled={busy || !teamName.trim()}
					onClick={() => void createTeam()}
				/>
			</div>

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

<style lang="scss">
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
	.team-create {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--gutter-sm);
	}
	:global(.panel-header__identity > small) {
		color: var(--color-light-tertiary);
	}
</style>

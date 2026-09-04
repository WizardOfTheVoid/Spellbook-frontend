<script lang="ts">
	import type { AdminUserRecord } from "$lib/core"
	import { notifyError } from "$lib/notifications/notificationEvents"
	import { unwrap } from "$lib/utils/apiResult"
	import EmptyState from "$lib/components/ui/EmptyState.svelte"
	import Icon from "$lib/components/ui/Icon.svelte"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import ListRow from "$lib/components/ui/ListRow.svelte"
	import SearchField from "$lib/components/ui/SearchField.svelte"
	import { accountStatus, accountStatusLabel } from "./accountStatus"

	export let active = false
	export let onOpenUser: (userId: number) => void

	const pageSize = 200
	let users: AdminUserRecord[] = []
	let search = ""
	let loaded = false
	let loading = false

	$: normalizedSearch = search.trim().toLocaleLowerCase()
	$: filteredUsers = normalizedSearch ? users.filter(matchesSearch) : users
	$: if (active && !loaded) void loadUsers()

	async function loadUsers(): Promise<void> {
		loading = true
		try {
			const loadedUsers: AdminUserRecord[] = []
			let offset = 0
			while (true) {
				const batch = await unwrap<AdminUserRecord[]>(
					await window.chivServer.admin.users.list({ limit: pageSize, offset }),
					"Users request failed.",
				)
				loadedUsers.push(...batch)
				if (batch.length < pageSize) break
				offset += pageSize
			}
			users = loadedUsers
			loaded = true
		} catch (error) {
			notifyError(message(error, "Users request failed."), { dedupeKey: "admin:users" })
		} finally {
			loading = false
		}
	}

	function refresh(): void {
		loaded = false
		void loadUsers()
	}

	function matchesSearch(user: AdminUserRecord): boolean {
		return [user.displayName, user.username, user.playfabId, user.discordId, user.id.toString()]
			.some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
	}

	function message(error: unknown, fallback: string): string {
		return error instanceof Error ? error.message : fallback
	}
</script>

<div class="admin-users grid-stack gap-100">
	<div class="admin-users__toolbar">
		<SearchField bind:value={search} placeholder="Search users" label="Users" />
		<IconButton icon="fa-rotate" ariaLabel="Refresh users" disabled={loading} onClick={refresh} />
	</div>
	{#each filteredUsers as user (user.id)}
		<ListRow
			title={user.displayName}
			subtitle={`${user.playfabId ?? "No PlayFab ID"} · @${user.username}`}
			onClick={() => onOpenUser(user.id)}
		>
			<svelte:fragment slot="leading">
				<span class="admin-avatar">
					{#if user.avatarUrl}<img src={user.avatarUrl} alt="" />{:else}<Icon name="fa-user" size="md" tone="muted" />{/if}
				</span>
			</svelte:fragment>
			<svelte:fragment slot="trailing">
				<span class:admin-status--banned={accountStatus(user) === "suspended"} class="admin-status">
					{accountStatusLabel(accountStatus(user))}
				</span>
				<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
			</svelte:fragment>
		</ListRow>
	{:else}
		<EmptyState
			title={loading ? "Loading users" : "No users"}
			message={loading ? "Fetching user accounts." : "No users match this search."}
		/>
	{/each}
</div>

<style lang="scss">
	.admin-users__toolbar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--gutter-sm);
	}
	.admin-avatar {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--color-dark-tertiary);
		border-radius: 999px;
	}
	.admin-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.admin-status {
		color: var(--color-accent-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}
	.admin-status--banned { color: var(--color-accent-quaternary); }
</style>

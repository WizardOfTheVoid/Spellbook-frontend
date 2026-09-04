<script lang="ts">
	import { onMount } from "svelte"
	import type { DiscordInstallResult, DiscordTeamConnection } from "$lib/core"
	import { celebrateElement } from "$lib/utils/celebrate"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
	import { unwrap } from "$lib/utils/apiResult"
	import { ModalStateCoordinator } from "$lib/utils/quickActionUi"
	import ConfirmModal from "$lib/components/ui/ConfirmModal.svelte"
	import Tile from "$lib/components/ui/Tile.svelte"
	import {
		completedDiscordConnection,
		discordActionConnection,
		discordConnectionState,
		discordTilePresentation,
		type DiscordConnectionState,
	} from "./discordTeamConnection"

	export let teamId: number

	let state: DiscordConnectionState = { status: `checking` }
	let busy = false
	let modalOpen = false
	let root: HTMLDivElement
	let returnFocus: HTMLButtonElement | null = null
	const notice = { icon: `fa-discord`, iconType: `brands` as const }
	const modalState = new ModalStateCoordinator(open => window.chivOverlay.setModalOpen(open))

	$: tile = discordTilePresentation(state)

	onMount(() => {
		void load()
		const removeListener = window.chivServer.teams.onDiscordInstallCompleted(completeInstall)
		return () => {
			removeListener()
			if (modalOpen) void closeModal()
		}
	})

	async function load(): Promise<void> {
		state = { status: `checking` }
		try {
			state = discordConnectionState(await unwrap<DiscordTeamConnection | null>(
				await window.chivServer.teams.discord(teamId),
				`Discord connection request failed.`,
			))
		} catch (error) {
			fail(error, `Discord connection request failed.`, `discord:connection:${teamId}`)
		}
	}

	async function act(): Promise<void> {
		const connection = discordActionConnection(state)
		if (connection) {
			state = { status: `connected`, connection }
			returnFocus = root?.querySelector(`button`) ?? null
			try {
				await modalState.set(true)
				modalOpen = true
			} catch (error) {
				fail(error, `Discord unlink dialog failed.`)
			}
			return
		}

		busy = true
		state = { status: `linking` }
		try {
			await unwrap(await window.chivServer.teams.installDiscord(teamId), `Discord installation failed.`)
		} catch (error) {
			fail(error, `Discord installation failed.`)
		} finally {
			busy = false
		}
	}

	function completeInstall(result: DiscordInstallResult): void {
		const completed = completedDiscordConnection(teamId, result)
		if (!completed) return
		state = completed.state
		if (state.status === `connected`) {
			notifySuccess(`SpellBook connected to ${state.connection.guildName}.`, notice)
			SFX.play(`success`)
			if (completed.celebrate) window.requestAnimationFrame(celebrate)
		} else if (state.status === `failed`) {
			notifyError(state.message, notice)
		}
	}

	function celebrate(): void {
		if (!root) return
		celebrateElement(root)
	}

	async function unlink(): Promise<void> {
		if (state.status !== `connected`) return
		const connection = state.connection
		busy = true
		try {
			await unwrap(await window.chivServer.teams.unlinkDiscord(teamId), `Discord unlink failed.`)
			state = { status: `unlinked` }
			await closeModal()
			notifySuccess(
				`SpellBook unlinked from ${connection.guildName}. The bot remains in that server.`,
				notice,
			)
		} catch (error) {
			state = {
				status: `failed`,
				message: errorMessage(error, `Discord unlink failed.`),
				connection,
			}
			await closeModal()
			notifyError(state.message, notice)
		} finally {
			busy = false
		}
	}

	async function closeModal(): Promise<void> {
		modalOpen = false
		await modalState.set(false).catch(() => undefined)
	}

	function fail(error: unknown, fallback: string, dedupeKey?: string): void {
		const message = errorMessage(error, fallback)
		state = { status: `failed`, message }
		notifyError(message, { ...notice, dedupeKey })
	}

	function errorMessage(error: unknown, fallback: string): string {
		return error instanceof Error ? error.message : fallback
	}
</script>

<div class="discord-team-tile" bind:this={root}>
	<Tile
		title={tile.title}
		subtitle={tile.subtitle}
		value={state.status === `connected` ? `Manage` : state.status === `failed` ? `Retry` : null}
		icon="fa-discord"
		iconType="brands"
		iconTone={state.status === `connected` ? `success` : `default`}
		tone={tile.tone}
		disabled={busy || tile.disabled}
		onClick={() => void act()}
	/>
</div>

{#if modalOpen && state.status === `connected`}
	<ConfirmModal
		title="Unlink SpellBook?"
		message={`Do you want to unlink this team from “${state.connection.guildName}”? SpellBook will stay in the Discord server.`}
		confirmLabel="Yes, unlink"
		{busy}
		{returnFocus}
		onConfirm={() => void unlink()}
		onCancel={() => void closeModal()}
	/>
{/if}

<style lang="scss">
	.discord-team-tile {
		display: grid;
	}
</style>

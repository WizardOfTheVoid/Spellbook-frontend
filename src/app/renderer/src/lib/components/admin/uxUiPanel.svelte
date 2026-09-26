<script lang="ts">
	import Tile from '$lib/components/ui/Tile.svelte'
	import TileGrid from '$lib/components/ui/TileGrid.svelte'
	import { requestHelp } from '$lib/components/navigation/helpNotice'
	import { onDestroy } from 'svelte'
	import { presentNotificationArrival } from '$lib/notifications/notificationPresentation'
	import { notify } from '$lib/notifications/notificationEvents'
	import { wantedExecutionNotificationSource, type NotificationRecord } from '@spellbook/shared/notifications'

	let previewTimer: ReturnType<typeof setTimeout> | undefined
	let nextPreviewId = -1
	let previewPending = false
	onDestroy(() => clearTimeout(previewTimer))

	function preview(wanted: boolean, delayed = false): void {
		clearTimeout(previewTimer)
		previewPending = delayed
		const show = () => {
			previewPending = false
			const now = new Date().toISOString()
			const notification: NotificationRecord = {
				id: nextPreviewId--, userId: 0, tone: `success`,
				title: wanted ? `Community ban` : `Notification preview`,
				description: wanted ? `ExamplePlayer was banned from your server automatically for cheating.` : `A short update with an icon, title and description.`,
				icon: wanted ? `fa-user-slash` : `fa-bell`,
				source: wanted ? wantedExecutionNotificationSource : `preview`,
				content: wanted ? { actionType: `ban` } : {}, meta: {},
				callback: null, readAt: null, deletedAt: null, createdAt: now, updatedAt: now,
			}
			presentNotificationArrival(notification, {
				isCurrent: () => true, notify, setRead: async () => {}, open: async () => {},
			})
		}
		if (delayed) previewTimer = setTimeout(show, 3000)
		else show()
	}
</script>

<TileGrid columns={1}>
	<Tile title="Emulate first time login" subtitle="Open the Welcome tab" icon="fa-hand-wave"
		onClick={() => requestHelp(`welcome`)} />
	<Tile title="Emulate update" subtitle="Open the Changelogs tab" icon="fa-clock-rotate-left"
		onClick={() => requestHelp(`changelogs`)} />
	<Tile title="Preview notification" subtitle="Show a standard notification" icon="fa-bell"
		onClick={() => preview(false)} />
	<Tile title="Preview Wanted notification" subtitle="Show the Wanted tint and Badge sound" icon="fa-user-slash"
		onClick={() => preview(true)} />
	<Tile title="Preview delayed notification" subtitle="Show above the game, desktop or SpellBook in 3 seconds" icon="fa-gamepad"
		disabled={previewPending} onClick={() => preview(false, true)} />
	<Tile title="Preview delayed Wanted notification" subtitle="Show above the game, desktop or SpellBook in 3 seconds" icon="fa-user-slash"
		disabled={previewPending} onClick={() => preview(true, true)} />
</TileGrid>

<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte"
	import { notifyError } from "$lib/notifications/notificationEvents"
	import { unwrap } from "$lib/utils/apiResult"
	import type { AdminNotificationAudience, NotificationTone } from "@spellbook/shared/notifications"
	import CustomNotificationModal from "./customNotificationModal.svelte"

	const tones: Array<{ tone: NotificationTone, icon: string }> = [
		{ tone: `success`, icon: `fa-circle-check` },
		{ tone: `error`, icon: `fa-circle-xmark` },
		{ tone: `warning`, icon: `fa-triangle-exclamation` },
		{ tone: `custom`, icon: `fa-bell` },
	]
	let running: NotificationTone | null = null
	let audience: AdminNotificationAudience | null = null

	async function createNotification(tone: NotificationTone): Promise<void> {
		if (running) return
		running = tone
		try {
			await unwrap(
				await window.chivServer.admin.notificationTests.create(tone),
				`Notification test failed.`,
			)
		} catch (error) {
			notifyError(error instanceof Error ? error.message : `Notification test failed.`, {
				dedupeKey: `admin:notification-tests:${tone}`,
			})
		} finally {
			running = null
		}
	}

	function label(tone: NotificationTone): string {
		return `${tone.charAt(0).toUpperCase()}${tone.slice(1)}`
	}
</script>

<section class="notification-tests">
	<div>
		<h2>Send test notifications</h2>
		<p>These test notifications are sent only to yourself.</p>
	</div>
	<div class="notification-tests__actions">
		{#each tones as fixture (fixture.tone)}
			<Button
				label={running === fixture.tone ? `Creating…` : label(fixture.tone)}
				icon={fixture.icon}
				variant={fixture.tone === `error` ? `danger` : fixture.tone === `success` ? `primary` : `ghost`}
				disabled={running !== null}
				onClick={() => void createNotification(fixture.tone)}
			/>
		{/each}
	</div>
</section>

<section class="notification-tests notification-tests--real">
	<div>
		<h2>Send a real notification</h2>
		<p>Send a custom notification to everyone's inbox, specific users, or teams.</p>
	</div>
	<div class="notification-tests__actions">
		<Button label="Send a custom notification to everyone" icon="fa-bullhorn" onClick={() => audience = `everyone`} />
		<Button label="Send a custom notification to specific users" icon="fa-users" onClick={() => audience = `users`} />
		<Button label="Send a custom notification to teams" icon="fa-people-group" onClick={() => audience = `teams`} />
	</div>
</section>

{#if audience}
	<CustomNotificationModal {audience} onClose={() => audience = null} />
{/if}

<style lang="scss">
	.notification-tests {
		display: grid;
		align-content: start;
		gap: var(--gutter-lg);
	}

	h2,
	p {
		margin: 0;
	}

	p {
		margin-top: var(--gutter-sm);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
	}

	.notification-tests__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gutter-md);
	}

	.notification-tests--real {
		margin-top: var(--gutter-lg);
		padding-top: var(--gutter-lg);
		border-top: 1px solid var(--color-dark-tertiary);
	}
</style>

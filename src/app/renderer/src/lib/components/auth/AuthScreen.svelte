<script lang="ts">
	import type { UserSession } from "$lib/core";
	import { completeOnboarding, loginWithDiscord, logout } from "$lib/auth/user";
	import logoUrl from "$lib/resources/logo.svg?url";

	export let user: UserSession | null;
	export let startupError: string | null = null;
	export let startupErrorCode: string | null = null;
	export let onClose: () => void;

	let displayName = user?.displayName ?? "";
	let playfabId = user?.playfabId ?? "";
	let submitting = false;
	let error = startupError ?? "";
	$: awaitingApproval = user?.isActive === false;
	$: updateRequired = startupErrorCode === `APP_UPDATE_REQUIRED`

	$: accountNotice =
		startupErrorCode === "ACCOUNT_AWAITING_APPROVAL" ?
			{
				title: "Awaiting approval",
				message:
					"Your account is waiting for approval. A superadmin has been informed.",
			}
		: startupErrorCode === "ACCOUNT_SUSPENDED" ?
			{
				title: "Account suspended",
				message: startupError?.trim() || `No suspension reason was provided.`,
			}
		:	null;

	async function login(): Promise<void> {
		submitting = true;
		error = "";
		try {
			await loginWithDiscord();
		} catch (value) {
			error = value instanceof Error ? value.message : "Discord login failed.";
		} finally {
			submitting = false;
		}
	}

	async function onboard(): Promise<void> {
		if (!displayName.trim() || !playfabId.trim()) return;
		submitting = true;
		error = "";
		try {
			await completeOnboarding(displayName, playfabId);
		} catch (value) {
			error = value instanceof Error ? value.message : "Profile setup failed.";
		} finally {
			submitting = false;
		}
	}
	async function signOut(): Promise<void> {
		submitting = true;
		error = ``;
		try {
			await logout();
		} catch (value) {
			error = value instanceof Error ? value.message : `Logout failed.`;
		} finally {
			submitting = false;
		}
	}
	async function openUpdate(): Promise<void> {
		try {
			await window.chivOverlay.openUpdatePage()
		} catch {
			error = `The SpellBook update page could not be opened.`
		}
	}
</script>

<main class="auth-screen">
	<section class="auth-panel">
		<div class="auth-mark"><img src={logoUrl} alt="SpellBook" /></div>
		<p class="eyebrow">SpellBook</p>
		{#if updateRequired}
			<h1>Update required</h1>
			<p class="account-notice">Please update your SpellBook to the latest version</p>
			<button type="button" on:click={() => void openUpdate()}>Get latest release</button>
		{:else if awaitingApproval}
			<h1>Pending approval</h1>
			<p class="account-notice">Your account is waiting for approval.</p>
			<p class="account-notice" role="status">
				You'll get access automatically once approved.
			</p>
			<p class="account-help">
				Need help?
				<button
					type="button"
					class="link-button"
					on:click={() => void window.chivAuth.openHelp()}
					>Create a ticket</button
				>
			</p>
		{:else if !user}
			<h1>{accountNotice?.title ?? "Sign in"}</h1>
			{#if accountNotice}
				{#if startupErrorCode === "ACCOUNT_SUSPENDED"}
					<div class="suspension-reason">
						<p class="reason-label">Suspension reason</p>
						<p class="account-notice">{accountNotice.message}</p>
					</div>
					<p class="account-notice">
						If you think this was a mistake, create a ticket on Discord.
					</p>
				{:else}
					<p class="account-notice">{accountNotice.message}</p>
				{/if}
				<p class="account-help">
					<button
						type="button"
						class="link-button"
						on:click={() => void window.chivAuth.openHelp()}
					>
						Create a ticket on Discord
					</button>
				</p>
			{/if}
			{#if startupErrorCode !== "ACCOUNT_SUSPENDED"}
				<button
					class="discord-button"
					type="button"
					on:click={() => void login()}
					disabled={submitting}
				>
					<i class="fa-brands fa-discord" aria-hidden="true"></i>
					<span
						>{accountNotice ?
							"Check again with Discord"
						:	"Continue with Discord"}</span
					>
				</button>
			{/if}
		{:else}
			<h1>Complete profile</h1>
			<form on:submit|preventDefault={() => void onboard()}>
				<label for="onboarding-name">Display name</label>
				<input
					id="onboarding-name"
					bind:value={displayName}
					maxlength="255"
					autocomplete="nickname"
					required
				/>
				<label for="onboarding-playfab">PlayFab ID</label>
				<input
					id="onboarding-playfab"
					bind:value={playfabId}
					maxlength="255"
					autocomplete="off"
					required
				/>
				<button
					type="submit"
					disabled={submitting || !displayName.trim() || !playfabId.trim()}
					>Enter SpellBook</button
				>
			</form>
		{/if}
		<div class="auth-actions">
			{#if !updateRequired && (user || accountNotice)}
				<button
					type="button"
					on:click={() => void signOut()}
					disabled={submitting}>Logout</button
				>
			{/if}
			<button type="button" on:click={onClose}>Close</button>
		</div>
		{#if error && !accountNotice && (!updateRequired || error !== startupError)}<p class="auth-error" role="alert">
				{error}
			</p>{/if}
	</section>
</main>

<style lang="scss">
	.auth-screen {
		width: 100vw;
		height: 100vh;
		display: grid;
		place-items: center;
		background: linear-gradient(
				135deg,
				rgba(9, 12, 18, 0.96),
				rgba(19, 24, 31, 0.9)
			),
			repeating-linear-gradient(
				45deg,
				transparent 0 18px,
				rgba(255, 255, 255, 0.025) 18px 19px
			);
	}

	.auth-panel {
		width: min(360px, calc(100vw - 48px));
		display: grid;
		gap: 14px;
	}
	.auth-mark {
		width: 48px;
		height: 48px;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-border);
	}
	.auth-mark img {
		width: 40px;
		height: 40px;
		object-fit: contain;
	}
	h1 {
		margin: 0 0 12px;
		font-size: 32px;
		letter-spacing: 0;
	}
	form {
		display: grid;
		gap: 10px;
	}
	label {
		margin-top: 6px;
		color: var(--color-text-secondary);
	}
	input,
	button {
		min-height: 44px;
	}
	.discord-button {
		background: #5865f2;
		color: white;
		border-color: #5865f2;
	}
	.auth-error {
		margin: 4px 0 0;
		color: var(--color-danger);
	}
	.account-notice,
	.account-help {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
	.account-help {
		display: flex;
		gap: 6px;
	}
	.suspension-reason {
		padding: 14px;
		border: 1px solid var(--color-border);
		border-left: 2px solid var(--color-danger);
		max-height: 35vh;
		overflow-y: auto;
	}
	.suspension-reason .account-notice {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.reason-label {
		margin: 0 0 6px;
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	.auth-actions {
		display: flex;
		gap: 10px;
	}
	.auth-actions button {
		flex: 1;
	}
	.link-button {
		min-height: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-accent-primary);
		text-decoration: underline;
	}
</style>

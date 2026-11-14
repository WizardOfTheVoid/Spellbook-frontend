<script lang="ts">
	import logo from "$lib/resources/logo.svg";
</script>

<div class="anti-afk-status" role="status" aria-label="Anti-AFK enabled">
	<img src={logo} alt="" aria-hidden="true" />
	<span>Anti-AFK: <strong>Enabled</strong></span>
</div>

<style lang="scss">
	:global(html),
	:global(body) {
		width: 100%;
		height: 100%;
		margin: 0;
		background: transparent;
		overflow: hidden;
	}

	.anti-afk-status {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		height: 100%;
		padding: 10px 14px;
		border: 1px solid rgba(232, 202, 118, 0.4);
		border-radius: 10px;
		background: rgba(5, 13, 21, 0.9);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
		color: #f3f4f6;
		font-size: 14px;
		font-weight: var(--font-weight-medium);
		line-height: 1;
	}

	img {
		width: 34px;
		height: 34px;
		flex: 0 0 auto;
	}

	strong {
		color: #a7f5d8;
		font-weight: var(--font-weight-bold);
	}
</style>

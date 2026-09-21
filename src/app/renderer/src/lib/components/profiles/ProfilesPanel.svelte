<script lang="ts">
	import {
		navigation,
		rememberNavigation,
		navigationScroll,
	} from "$lib/navigation/navigation";
	import { onDestroy } from "svelte";
	import { formatOffenseType } from "$lib/utils/formatOffenseType";
	import { unsavedChanges } from "$lib/utils/unsavedChanges";
	import { tick } from "svelte";
	import type {
		GameServerRecord,
		ProfileOwner,
		ProfileOwnerOption,
		PlayerOffenseType,
		ServerProfileAction,
		ServerProfileActionDomain,
		ServerProfileAssignment,
		ServerProfileCommand,
		ServerProfileCommandType,
		ServerProfileGraph,
		ServerProfileSource,
		ServerProfileSummary,
	} from "$lib/core";
	import { serverProfileActionIcons } from "$lib/core";
	import type { FormOption } from "$lib/types/ui";
	import { User } from "$lib/auth/user";
	import { authState } from "$lib/auth/user";
	import {
		notifyError,
		notifySuccess,
	} from "$lib/notifications/notificationEvents";
	import {
		createServerProfile,
		deleteServerProfile,
		fetchProfileAssignments,
		fetchProfileOwners,
		fetchProfileSummaries,
		fetchProfileServers,
		fetchServerProfile,
		setServerProfileEnabled,
		updateServerProfile,
	} from "$lib/utils/serverProfilesApi";
	import { gameServerRevision } from "$lib/stores/gameServersStore";
	import { ApiResultError } from "$lib/utils/apiResult";
	import {
		buildProfileServerOptions,
		eligibleProfileServers,
		canTransferProfileOwner,
		reconcileProfileServerAssignments,
	} from "$lib/utils/profileManagement";

	import {
		profileActionIcon,
		profileActionIconColor,
	} from "$lib/utils/profileActions";
	import { insertMessageTag } from "$lib/utils/messageTags";
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Tabs from "$lib/components/ui/tabs.svelte";
	import RulesetPanel from "./rulesets/rulesetPanel.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import HelpHint from "$lib/components/ui/helpHint.svelte";
	import MultiSelect from "$lib/components/ui/MultiSelect.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import Toggle from "$lib/components/ui/Toggle.svelte";
	import Tile from "$lib/components/ui/Tile.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import BanDuration from "./banDuration.svelte";
	import IncrementalBanEditor from "./incrementalBanEditor.svelte";
	import {
		validateIncrementalBan,
		type IncrementalBan,
	} from "@spellbook/shared/actions/incrementalBan";
	import Select from "$lib/components/ui/Select.svelte";
	import Textarea from "$lib/components/ui/Textarea.svelte";
	import CommandMessageSupport from "$lib/components/messages/commandMessageSupport.svelte";
	import { isMessageCommand } from "@spellbook/shared/actions/actionMessage.js";
	import ProfileSourceModal from "./ProfileSourceModal.svelte";
	import {
		canManageProfile,
		duplicateAction,
		duplicateCommand,
		newProfileDraft,
		profileChanges,
		profileInput,
		replaceProfileActions,
		uniqueNewName,
		validateCommandFields,
	} from "./profileEditor";
	import { openProfileEditorMenu } from "./profileEditorMenu";
	import {
		closeInfinityMenu,
		infinityMenuState,
	} from "$lib/components/ui/infinityMenu";
	import { openProfileMenu } from "./profileMenu";
	import { profilePreferencesState } from "$lib/stores/profilePreferencesStore";

	export let onOpenYourServers: () => void;
	export let hidden = false;
	export let isActive = false;
	export let selectedOwner: ProfileOwner | null = null;
	export let selectedProfileId: number | null = null;
	export let onSelectProfile: (profileId: number | null) => void;
	export let onSelectOwner: (owner: ProfileOwner) => void;

	type ProfileMode = "list" | "editing" | "creating";
	type ProfileView = "overview" | "profile" | "action" | "command";
	type ProfileTab = `settings` | `actions` | `rulesets`;
	$: ruleSummary = summaries.find(
		(item) => item.profile.id === profile?.profile.id,
	);
	$: profileTabs = [
		{ value: `settings`, label: `Settings`, icon: `fa-gear` },
		{
			value: `actions`,
			label: `Actions`,
			icon: `fa-bolt`,
			count: `${profile?.actions.filter((action) => action.isEnabled).length ?? 0}/${profile?.actions.length ?? 0}`,
		},
		{
			value: `rulesets`,
			label: `Rulesets`,
			icon: `fa-layer-group`,
			count: `${ruleSummary?.enabledRuleCount ?? 0}/${ruleSummary?.ruleCount ?? 0}`,
		},
	];
	let profileTab: ProfileTab = `settings`;

	const initialIncrementalBan: IncrementalBan = {
		windowDays: null,
		offenseTypes: null,
		stages: [{ banCount: 1, durationHours: 24 }],
	};
	const durationSteps = [1, 2, 3, 4, 8, 10, 12, 24, 48, 72, 96, 168, 336, 672];
	const offenseTypes: PlayerOffenseType[] = [
		"hacker",
		"ffa",
		"verbal_abuse",
		"griefing",
		"exploiting",
		"toxic_behavior",
		"low_level",
		"votekick_abuse",
		"other",
	];
	const commandTypes: ServerProfileCommandType[] = [
		"server_message",
		"admin_message",
		"warn",
		"kick",
		"ban",
		`incremental_ban`,
		"unban",
	];
	const actionDomains: Array<{
		value: ServerProfileActionDomain;
		label: string;
	}> = [
		{ value: "player", label: "Player action" },
		{ value: "server", label: "Server action" },
	];

	let ownerOptions: ProfileOwnerOption[] = [];
	let gameServers: GameServerRecord[] = [];
	let assignments: ServerProfileAssignment[] = [];
	let summaries: ServerProfileSummary[] = [];
	let profile: ServerProfileGraph | null = null;
	let mode: ProfileMode = "list";
	let view: ProfileView = "overview";
	let selectedActionIndex: number | null = null;
	let selectedCommandIndex: number | null = null;
	let loading = false;
	let saving = false;
	let ownerOptionsLoaded = false;
	let loadedProfilesKey = "";
	let loadedProfileId: number | null = null;
	let draggedActionIndex: number | null = null;
	let draggedCommandIndex: number | null = null;
	let serverOptions: FormOption[] = [];
	let selectedServerValues: string[] = [];
	let transferOwnerKey = "";
	let commandMessageInput: HTMLTextAreaElement;
	let commandMessageCount: string | null = null
	let savedProfileState = ``;
	let ownerOptionsRevision = 0;
	let profilesRevision = 0;
	let profileRevision = 0;
	let savedProfile: ServerProfileGraph | null = null;
	let rulesetPanel: RulesetPanel | null = null;
	let rulesetSaving = false;
	let initialDraft: ServerProfileGraph | null = null;
	let sourceModal: {
		mode: `create` | `restore`;
		owner: ProfileOwner;
		profileId: number | null;
	} | null = null;
	let menuOwner: HTMLElement | null = null;
	let menuTarget: ServerProfileAction | ServerProfileCommand | null = null;
	let preferenceSavingIds = new Set<number>();
	let preferencesUserId = $authState.user?.id ?? null;
	let summaryMenuOwner: HTMLElement | null = null;
	let summaryMenuWasOpen = false;
	onDestroy(
		unsavedChanges.register(() =>
			Boolean(
				profile && canEditProfile && profileState() !== savedProfileState,
			),
		),
	);
	onDestroy(() => {
		invalidateProfileLoad();
		closeEditorMenu();
	});

	function profileState(): string {
		return profile ?
				JSON.stringify([profileInput(profile, true), transferOwnerKey])
			:	``;
	}

	$: selectedServerIds = new Set(
		profile?.servers.map((server) => server.gameServerId) ?? [],
	);

	$: memberTeamIds = ownerOptions
		.filter((owner) => owner.type === `team`)
		.map((owner) => owner.id);
	$: eligibleServers = eligibleProfileServers(
		gameServers.filter(server => !server.official),
		selectedOwner,
		memberTeamIds,
	);
	$: serverOptions = buildProfileServerOptions(
		eligibleServers,
		assignments,
		profile?.profile.id ?? null,
		selectedOwner,
		memberTeamIds,
		profile?.servers ?? [],
	);
	$: selectedServerValues = Array.from(selectedServerIds, (serverId) =>
		serverId.toString(),
	);

	$: selectedAction =
		profile && selectedActionIndex !== null ?
			(profile.actions[selectedActionIndex] ?? null)
		:	null;
	$: selectedCommand =
		selectedAction && selectedCommandIndex !== null ?
			(selectedAction.commands[selectedCommandIndex] ?? null)
		:	null;

	$: selectedOwnerKey =
		selectedOwner ? `${selectedOwner.type}:${selectedOwner.id}` : "";
	$: panelTitle =
		view === "overview" ? "Profiles"
		: view === "profile" ? (profile?.profile.name ?? "Profile")
		: view === "action" ? (selectedAction?.label ?? "Action")
		: labelCommandType(selectedCommand?.commandType ?? "server_message");
	$: selectedProfilesKey = `${selectedOwnerKey}:${$gameServerRevision}`;
	$: canCreateProfile = canManageProfile(
		selectedOwner,
		`create`,
		$authState.user,
		ownerOptions,
	);
	$: canEditProfile = canManageProfile(
		profile?.profile.owner ?? null,
		mode === `creating` ? `create` : `edit`,
		$authState.user,
		ownerOptions,
		profile?.profile.isPreset,
	);
	$: canDeleteProfile = Boolean(
		profile &&
			!profile.profile.isDefault && !profile.profile.isMaster &&
			canManageProfile(
				profile.profile.owner,
				`delete`,
				$authState.user,
				ownerOptions,
				profile.profile.isPreset,
			),
	);
	$: editorDisabled = saving || !canEditProfile;
	$: editingDefault =
		view !== `overview` && profile?.profile.isDefault && canEditProfile;
	$: profileSubtitle =
		profile?.profile.isMaster ? `Master Profile`
		: profile?.profile.isDefault ? `Default profile`
		: profile?.profile.owner.type === `team` ?
			`Team profile: ${ownerOptions.find((owner) => owner.type === `team` && owner.id === profile?.profile.owner.id)?.name ?? `Team ${profile.profile.owner.id}`}`
		:	`Personal profile`;
	$: canTransferProfile = mode === "editing" && canDeleteProfile;
	$: transferOwnerOptions = ownerOptions.filter(
		(option) =>
			`${option.type}:${option.id}` === selectedOwnerKey ||
			User.Ability.can("create", option),
	);
	$: profileOwnerSelectOptions = ownerOptions.map((owner) => ({
		value: `${owner.type}:${owner.id}`,
		label: owner.name,
	}));
	$: transferOwnerSelectOptions = transferOwnerOptions.map((owner) => ({
		value: `${owner.type}:${owner.id}`,
		label: owner.name,
		disabled: Boolean(
			profile &&
				!canTransferProfileOwner(
					profile.profile.owner,
					owner,
					Math.max(savedProfile?.servers.length ?? 0, profile.servers.length),
				),
		),
	}));
	$: actionDomainOptions = actionDomains.map((domain) => ({ ...domain }));
	$: iconOptions = serverProfileActionIcons.map((icon) => ({
		value: icon.key,
		label: icon.label,
	}));
	$: commandTypeOptions =
		selectedAction ?
			commandTypesForAction(selectedAction).map((type) => ({
				value: type,
				label: labelCommandType(type),
			}))
		:	[];
	$: offenseTypeOptions = offenseTypes.map((offenseType) => ({
		value: offenseType,
		label: formatOffenseType(offenseType),
	}));

	$: if (isActive && !ownerOptionsLoaded) {
		void loadOwnerOptions();
	}
	$: if (($authState.user?.id ?? null) !== preferencesUserId) {
		preferencesUserId = $authState.user?.id ?? null;
		preferenceSavingIds = new Set();
	}
	$: if ($infinityMenuState?.owner?.hasAttribute(`data-profile-summary`)) {
		summaryMenuOwner = $infinityMenuState.owner;
		summaryMenuWasOpen = true;
	} else if (!$infinityMenuState && summaryMenuWasOpen) {
		const owner = summaryMenuOwner;
		summaryMenuOwner = null;
		summaryMenuWasOpen = false;
		if (owner?.isConnected) void tick().then(() => owner.focus());
	}
	$: if (!isActive || hidden) {
		sourceModal = null;
		closeEditorMenu();
		invalidateProfileLoad();
		loadedProfilesKey = ``;
	}

	$: if (
		isActive &&
		selectedOwner &&
		selectedProfilesKey !== loadedProfilesKey
	) {
		loadedProfilesKey = selectedProfilesKey;
		void refreshProfiles();
	}

	$: if (
		isActive &&
		selectedOwner &&
		selectedProfileId &&
		selectedProfileId !== loadedProfileId
	) {
		void openProfile(
			selectedProfileId,
			Boolean(navigation.restored(`profileView`)),
		);
	}

	async function loadOwnerOptions(): Promise<void> {
		const revision = ++ownerOptionsRevision;
		try {
			const loadedOwners = await fetchProfileOwners();
			if (revision !== ownerOptionsRevision) return;
			ownerOptions = loadedOwners;
			User.Ability.setOwners(ownerOptions);
			if (
				selectedOwner &&
				!ownerOptions.some(
					(owner) =>
						owner.type === selectedOwner?.type &&
						owner.id === selectedOwner?.id,
				)
			) {
				clearProfileSelection();
				const fallback =
					ownerOptions.find((owner) => owner.type === `user`) ??
					ownerOptions[0];
				if (fallback) onSelectOwner({ type: fallback.type, id: fallback.id });
			}
			ownerOptionsLoaded = true;
		} catch (loadError) {
			if (revision !== ownerOptionsRevision) return;
			notifyError(getError(loadError, "Profile owners failed."), {
				dedupeKey: "profiles:owner-options",
			});
		}
	}

	function clearProfileSelection(): void {
		sourceModal = null;
		closeEditorMenu();
		profilesRevision += 1;
		profileRevision += 1;
		loading = false;
		profile = null;
		summaries = [];
		mode = `list`;
		view = `overview`;
		selectedActionIndex = null;
		selectedCommandIndex = null;
		loadedProfilesKey = ``;
		loadedProfileId = null;
		onSelectProfile(null);
	}

	async function clearUnavailableSelection(): Promise<void> {
		const unavailableOwnerKey = selectedProfilesKey;
		clearProfileSelection();
		loadedProfilesKey = unavailableOwnerKey;
		ownerOptionsLoaded = false;
		await loadOwnerOptions();
	}

	async function refreshProfiles(profileOwner = selectedOwner): Promise<void> {
		if (!profileOwner) return;
		const ownerKey = `${profileOwner.type}:${profileOwner.id}`;
		const revision = ++profilesRevision;
		const ownersRevision =
			profileOwner.type === `user` ? ++ownerOptionsRevision : null;
		loading = true;

		try {
			const [profileSummaries, servers, profileAssignments, loadedOwners] =
				await Promise.all([
					fetchProfileSummaries(profileOwner),
					fetchProfileServers($authState.user?.isSuperadmin === true),
					fetchProfileAssignments(),
					ownersRevision === null ? null : fetchProfileOwners(),
				]);
			if (revision !== profilesRevision || selectedOwnerKey !== ownerKey)
				return;
			if (ownersRevision !== null && ownersRevision !== ownerOptionsRevision)
				return;
			if (loadedOwners) {
				ownerOptions = loadedOwners;
				User.Ability.setOwners(ownerOptions);
				ownerOptionsLoaded = true;
			}
			summaries = profileSummaries;
			gameServers = servers;
			assignments = profileAssignments;
		} catch (loadError) {
			if (revision !== profilesRevision || selectedOwnerKey !== ownerKey)
				return;
			if (isUnavailable(loadError)) {
				notifyError(getError(loadError, "Profiles request failed."), {
					dedupeKey: "profiles:list",
				});
				await clearUnavailableSelection();
				return;
			}
			notifyError(getError(loadError, "Profiles request failed."), {
				dedupeKey: "profiles:list",
			});
		} finally {
			if (revision === profilesRevision) loading = false;
		}
	}

	async function selectOwner(value: string): Promise<void> {
		await navigation.visit(async () => {
			if (!(await unsavedChanges.canLeave())) return;
			const owner = ownerOptions.find(
				(option) => `${option.type}:${option.id}` === value,
			);
			if (!owner) return;
			invalidateProfileLoad();
			sourceModal = null;
			closeEditorMenu();
			onSelectOwner({ type: owner.type, id: owner.id });
			profile = null;
			mode = "list";
			view = "overview";
			selectedActionIndex = null;
			selectedCommandIndex = null;
			loadedProfilesKey = "";
			loadedProfileId = null;
			onSelectProfile(null);
		});
	}

	function setProfileName(value: string): void {
		if (!profile || editorDisabled) return;
		profile.profile.name = value;
		profile = { ...profile };
	}

	function setProfileDescription(value: string): void {
		if (!profile || editorDisabled) return;
		profile.profile.description = value;
		profile = { ...profile };
	}

	function setActionLabel(value: string): void {
		if (!selectedAction || editorDisabled) return;
		selectedAction.label = value;
		touchProfile();
	}

	function setActionDescription(value: string): void {
		if (!selectedAction || editorDisabled) return;
		selectedAction.description = value;
		touchProfile();
	}

	function setActionDelay(value: string): void {
		if (!selectedAction || editorDisabled) return;
		selectedAction.delayMs = Number(value);
		touchProfile();
	}

	function setActionIcon(value: string): void {
		if (!selectedAction || editorDisabled) return;
		const icon = serverProfileActionIcons.find(
			(candidate) => candidate.key === value,
		);
		if (!icon) return;
		selectedAction.iconKey = icon.key;
		touchProfile();
	}

	function setActionEnabled(value: boolean): void {
		if (!selectedAction || editorDisabled) return;
		selectedAction.isEnabled = value;
		touchProfile();
	}

	function setActionVisibility(value: boolean): void {
		if (!selectedAction || editorDisabled) return
		selectedAction.showInGameServerActions = value
		touchProfile()
	}

	function setActionVariableGuard(value: boolean): void {
		if (!selectedAction || editorDisabled) return;
		selectedAction.blockOnMissingVariables = value;
		touchProfile();
	}

	function setCommandMessage(value: string): void {
		if (!selectedCommand || editorDisabled) return;
		selectedCommand.message = value;
		touchProfile();
	}

	function setCommandDelay(value: string): void {
		if (!selectedCommand || editorDisabled) return;
		selectedCommand.delayMs = Number(value);
		touchProfile();
	}

	function setCommandOffenseType(value: string): void {
		if (
			!selectedCommand ||
			editorDisabled ||
			!offenseTypes.includes(value as PlayerOffenseType)
		)
			return;
		selectedCommand.offenseType = value as PlayerOffenseType;
		touchProfile();
	}

	async function openProfile(
		profileId: number,
		discardConfirmed = false,
	): Promise<void> {
		if (!selectedOwner) return;
		if (!discardConfirmed && !(await unsavedChanges.canLeave())) return;
		const ownerKey = selectedOwnerKey;
		const revision = ++profileRevision;
		loading = true;

		try {
			const loadedProfile = await fetchServerProfile(selectedOwner, profileId);
			if (revision !== profileRevision || selectedOwnerKey !== ownerKey) return;
			profile = loadedProfile;
			savedProfile = structuredClone(loadedProfile);
			loadedProfileId = profileId;
			transferOwnerKey =
				profile.profile.owner.type === "system" ?
					selectedOwnerKey
				:	`${profile.profile.owner.type}:${profile.profile.owner.id}`;
			mode = "editing";
			view = "profile";
			profileTab = `settings`;
			selectedActionIndex = null;
			selectedCommandIndex = null;
			savedProfileState = profileState();
			const restored = navigation.restored<ProfileNavigation>(`profileView`);
			if (restored?.profileId === profileId) restoreProfileNavigation(restored);
			if (selectedProfileId !== profileId) onSelectProfile(profileId);
		} catch (loadError) {
			if (revision !== profileRevision || selectedOwnerKey !== ownerKey) return;
			if (isUnavailable(loadError)) {
				notifyError(getError(loadError, "Profile request failed."), {
					dedupeKey: `profiles:open:${profileId}`,
				});
				await clearUnavailableSelection();
				return;
			}
			notifyError(getError(loadError, "Profile request failed."), {
				dedupeKey: `profiles:open:${profileId}`,
			});
		} finally {
			if (revision === profileRevision) loading = false;
		}
	}

	async function duplicateProfile(
		summary: ServerProfileSummary,
	): Promise<void> {
		if (!selectedOwner || loading || saving || !canCreateProfile) return;
		if (!(await unsavedChanges.canLeave())) return;
		const destination = { ...selectedOwner };
		const ownerKey = `${destination.type}:${destination.id}`;
		const session = profilePreferencesState.captureSession();
		if (!session) return;
		const revision = ++profileRevision;
		loading = true;

		try {
			const source = await fetchServerProfile(destination, summary.profile.id);
			if (
				revision !== profileRevision ||
				selectedOwnerKey !== ownerKey ||
				!profilePreferencesState.isCurrent(session)
			)
				return;
			savedProfile = null;
			savedProfileState = ``;
			profile = newProfileDraft(
				destination,
				source,
				summaries.map((item) => item.profile.name),
			);
			initialDraft = structuredClone(profile);
			loadedProfileId = null;
			transferOwnerKey = ownerKey;
			mode = `creating`;
			view = `profile`;
			selectedActionIndex = null;
			selectedCommandIndex = null;
			onSelectProfile(null);
		} catch (loadError) {
			if (
				revision !== profileRevision ||
				selectedOwnerKey !== ownerKey ||
				!profilePreferencesState.isCurrent(session)
			)
				return;
			notifyError(getError(loadError, `Profile copy failed.`));
		} finally {
			if (revision === profileRevision) loading = false;
		}
	}

	async function setProfileEnabled(
		summary: ServerProfileSummary,
		isEnabled: boolean,
	): Promise<void> {
		if (
			!selectedOwner ||
			summary.profile.isDefault || summary.profile.isMaster ||
			preferenceSavingIds.has(summary.profile.id)
		)
			return;
		const owner = { ...selectedOwner };
		const ownerKey = `${owner.type}:${owner.id}`;
		const session = profilePreferencesState.captureSession();
		if (!session) return;
		setPreferenceSaving(summary.profile.id, true);

		try {
			await setServerProfileEnabled(owner, summary.profile.id, isEnabled);
			if (!profilePreferencesState.changed(session)) return;
			if (selectedOwnerKey === ownerKey) await refreshProfiles(owner);
		} catch (saveError) {
			if (profilePreferencesState.isCurrent(session))
				notifyError(getError(saveError, `Profile preference save failed.`));
		} finally {
			if (profilePreferencesState.isCurrent(session))
				setPreferenceSaving(summary.profile.id, false);
		}
	}

	function openSummaryMenu(
		event: MouseEvent,
		summary: ServerProfileSummary,
	): void {
		openProfileMenu(event, {
			summary,
			canDuplicate: canCreateProfile,
			busy: loading || saving || preferenceSavingIds.has(summary.profile.id),
			onOpen: async () => {
				await navigation.visit(() => openProfile(summary.profile.id));
			},
			onDuplicate: async () => {
				await navigation.visit(() => duplicateProfile(summary));
			},
			onSetEnabled: (isEnabled) => setProfileEnabled(summary, isEnabled),
		});
	}

	function openSummaryFromRow(
		event: MouseEvent,
		summary: ServerProfileSummary,
	): void {
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest(`button, a, input, select, textarea`)
		)
			return;
		void navigation.visit(() => openProfile(summary.profile.id));
	}

	function openSummaryFromKeyboard(
		event: KeyboardEvent,
		summary: ServerProfileSummary,
	): void {
		if (
			event.target !== event.currentTarget ||
			(event.key !== `Enter` && event.key !== ` `)
		)
			return;
		event.preventDefault();
		void navigation.visit(() => openProfile(summary.profile.id));
	}

	function setPreferenceSaving(profileId: number, pending: boolean): void {
		preferenceSavingIds = new Set(preferenceSavingIds);
		if (pending) preferenceSavingIds.add(profileId);
		else preferenceSavingIds.delete(profileId);
	}

	function invalidateProfileLoad(): void {
		profileRevision += 1;
		loading = false;
	}

	async function openSourceModal(
		sourceMode: `create` | `restore`,
	): Promise<void> {
		if (
			!selectedOwner ||
			saving ||
			loading ||
			(sourceMode === `create` ? !canCreateProfile : !canEditProfile)
		)
			return;
		if (sourceMode === `create` && !(await unsavedChanges.canLeave())) return;
		closeEditorMenu();
		sourceModal = {
			mode: sourceMode,
			owner: { ...selectedOwner },
			profileId: profile?.profile.id ?? null,
		};
	}

	function applyProfileSource(source: ServerProfileSource | null): void {
		const target = sourceModal;
		sourceModal = null;
		if (
			!target ||
			saving ||
			`${target.owner.type}:${target.owner.id}` !== selectedOwnerKey
		)
			return;
		profileRevision += 1;
		loading = false;
		if (target.mode === `restore`) {
			if (
				!profile ||
				!canEditProfile ||
				profile.profile.id !== target.profileId
			)
				return;
			profile = replaceProfileActions(profile, source?.actions ?? []);
			view = `profile`;
			selectedActionIndex = null;
			selectedCommandIndex = null;
			return;
		}
		if (!canCreateProfile) return;
		savedProfile = null;
		savedProfileState = ``;
		profile = newProfileDraft(
			target.owner,
			source,
			summaries.map((summary) => summary.profile.name),
		);
		initialDraft = structuredClone(profile);
		loadedProfileId = null;
		transferOwnerKey = selectedOwnerKey;
		mode = "creating";
		view = "profile";
		profileTab = `settings`;
		selectedActionIndex = null;
		selectedCommandIndex = null;
		onSelectProfile(null);
	}

	async function saveProfile(): Promise<void> {
		if (
			!selectedOwner ||
			!profile ||
			!canEditProfile ||
			saving ||
			rulesetSaving
		)
			return;
		saving = true;

		try {
			for (const action of profile.actions)
				for (const command of action.commands) {
					validateCommandFields(command);
					if (command.commandType === `incremental_ban`)
						validateIncrementalBan(command.incrementalBan);
				}
			const canPublish = Boolean($authState.user?.isSuperadmin);
			const input =
				mode === `creating` || !savedProfile ?
					profileInput(profile, canPublish)
				:	profileChanges(profile, savedProfile, canPublish);
			const transferOwner = ownerOptions.find(
				(option) => `${option.type}:${option.id}` === transferOwnerKey,
			);

			if (
				mode === "editing" &&
				!profile.profile.isDefault && !profile.profile.isMaster &&
				transferOwner &&
				`${transferOwner.type}:${transferOwner.id}` !== selectedOwnerKey
			) {
				if (
					!canTransferProfileOwner(
						profile.profile.owner,
						transferOwner,
						Math.max(savedProfile?.servers.length ?? 0, profile.servers.length),
					)
				) {
					throw new Error(
						`Remove attached servers and save before transferring ownership involving a team.`,
					);
				}
				input.transferOwner = {
					type: transferOwner.type,
					id: transferOwner.id,
				};
			}

			profile =
				mode === "creating" ?
					await createServerProfile(selectedOwner, input)
				:	await updateServerProfile(selectedOwner, profile.profile.id, input);
			const savedOwner =
				profile.profile.owner.type === "system" ?
					selectedOwner
				:	profile.profile.owner;
			const savedOwnerKey = `${savedOwner.type}:${savedOwner.id}`;
			mode = "editing";
			loadedProfileId = profile.profile.id;
			loadedProfilesKey = `${savedOwnerKey}:${$gameServerRevision}`;
			transferOwnerKey = savedOwnerKey;
			savedProfile = structuredClone(profile);
			savedProfileState = profileState();
			await rulesetPanel?.save();
			if (savedOwnerKey !== selectedOwnerKey) onSelectOwner(savedOwner);
			onSelectProfile(profile.profile.id);
			notifySuccess(
				rulesetPanel ? `Profile and ruleset saved.` : `Profile saved.`,
			);
			await refreshProfiles(savedOwner);
		} catch (saveError) {
			if (isUnavailable(saveError)) {
				void clearUnavailableSelection();
			}
			notifyError(getError(saveError, "Profile save failed."));
		} finally {
			saving = false;
		}
	}

	async function cancelProfile(): Promise<void> {
		if (!(await unsavedChanges.canLeave())) return;
		invalidateProfileLoad();
		selectedActionIndex = null;
		selectedCommandIndex = null;

		if (mode === "creating" || !profile?.profile.id) {
			profile = null;
			mode = "list";
			view = "overview";
			onSelectProfile(null);
			return;
		}

		await openProfile(profile.profile.id, true);
	}

	async function back(): Promise<void> {
		closeEditorMenu();
		if (rulesetPanel?.back()) return;
		if (view === "command") {
			view = "action";
			selectedCommandIndex = null;
			return;
		}

		if (view === "action") {
			view = "profile";
			profileTab = `actions`;
			selectedActionIndex = null;
			selectedCommandIndex = null;
			return;
		}

		if (!(await unsavedChanges.canLeave())) return;
		invalidateProfileLoad();
		profile = null;
		mode = "list";
		view = "overview";
		selectedActionIndex = null;
		selectedCommandIndex = null;
		onSelectProfile(null);
	}

	async function removeProfile(): Promise<void> {
		if (!selectedOwner || !profile || saving || !canDeleteProfile) return;
		if (!window.confirm(`Delete profile ${profile.profile.name}?`)) return;

		saving = true;

		try {
			await deleteServerProfile(selectedOwner, profile.profile.id);
			profile = null;
			mode = "list";
			view = "overview";
			selectedActionIndex = null;
			selectedCommandIndex = null;
			loadedProfileId = null;
			onSelectProfile(null);
			notifySuccess("Profile deleted.");
			await refreshProfiles();
		} catch (deleteError) {
			if (isUnavailable(deleteError)) void clearUnavailableSelection();
			notifyError(getError(deleteError, "Profile delete failed."));
		} finally {
			saving = false;
		}
	}

	function openAction(index: number): void {
		void navigation.visit(() => {
			closeEditorMenu();
			selectedActionIndex = index;
			selectedCommandIndex = null;
			view = "action";
		});
	}

	function openCommand(index: number): void {
		void navigation.visit(() => {
			closeEditorMenu();
			selectedCommandIndex = index;
			view = "command";
		});
	}

	function setSelectedServers(values: string[]): void {
		if (!profile || !selectedOwner || editorDisabled) return;
		const activeProfile = profile;
		const selectedIds = new Set(values.map(Number));
		profile.servers = reconcileProfileServerAssignments(
			activeProfile.servers,
			eligibleServers,
			selectedIds,
			selectedOwner,
			activeProfile.profile.id,
		);
		profile = { ...profile };
	}

	function addAction(): void {
		if (!profile || editorDisabled) return;
		const names = profile.actions.map((action) => action.label);
		profile.actions = [
			...profile.actions,
			defaultAction(
				uniqueNewName(`New action`, names),
				``,
				profile.actions.length,
				"player",
			),
		];
		profile = { ...profile };
		openAction(profile.actions.length - 1);
	}

	function removeAction(index: number): void {
		if (!profile || editorDisabled || !profile.actions[index]) return;
		profile.actions = profile.actions
			.filter((_, itemIndex) => itemIndex !== index)
			.map(reorderAction);
		profile = { ...profile };
		view = "profile";
		selectedActionIndex = null;
		selectedCommandIndex = null;
	}

	function moveSelectedAction(direction: -1 | 1): void {
		if (selectedActionIndex === null) return;
		moveAction(selectedActionIndex, direction);
	}

	function removeSelectedAction(): void {
		if (selectedActionIndex === null) return;
		removeAction(selectedActionIndex);
	}

	function moveAction(index: number, direction: -1 | 1): void {
		if (!profile) return;
		const nextIndex = index + direction;
		if (nextIndex < 0 || nextIndex >= profile.actions.length) return;
		reorderActions(index, nextIndex);
	}

	function dragActionStart(event: DragEvent, index: number): void {
		if (editorDisabled) {
			event.preventDefault();
			return;
		}
		draggedActionIndex = index;
		window.SFX?.play(`drag-start`);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("text/plain", index.toString());
		}
	}

	function dragActionOver(event: DragEvent): void {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
	}

	function dropAction(index: number): void {
		if (draggedActionIndex === null) return;
		reorderActions(draggedActionIndex, index);
		draggedActionIndex = null;
	}

	function endActionDrag(): void {
		if (draggedActionIndex !== null) window.SFX?.play(`snap`);
		draggedActionIndex = null;
	}

	function reorderActions(fromIndex: number, toIndex: number): void {
		if (!profile || editorDisabled) return;
		closeEditorMenu();
		if (fromIndex < 0 || fromIndex >= profile.actions.length) return;
		if (toIndex < 0 || toIndex >= profile.actions.length) return;
		if (fromIndex === toIndex) {
			window.SFX?.play(`snap`);
			return;
		}
		const actions = [...profile.actions];
		const [movedAction] = actions.splice(fromIndex, 1);
		actions.splice(toIndex, 0, movedAction);
		profile.actions = actions.map(reorderAction);
		selectedActionIndex = toIndex;
		profile = { ...profile };
		if (draggedActionIndex !== null) window.SFX?.play(`reorder`);
	}

	function addCommand(action: ServerProfileAction): void {
		if (editorDisabled) return;
		action.commands = [
			...action.commands,
			defaultCommand(``, action.commands.length),
		];
		touchProfile();
		openCommand(action.commands.length - 1);
	}

	function removeCommand(action: ServerProfileAction, index: number): void {
		if (
			editorDisabled ||
			action.commands.length <= 1 ||
			!action.commands[index]
		)
			return;
		action.commands = action.commands
			.filter((_, itemIndex) => itemIndex !== index)
			.map(reorderCommand);
		touchProfile();
		view = "action";
		selectedCommandIndex = null;
	}

	function moveSelectedCommand(direction: -1 | 1): void {
		if (!selectedAction || selectedCommandIndex === null) return;
		moveCommand(selectedAction, selectedCommandIndex, direction);
	}

	function removeSelectedCommand(): void {
		if (!selectedAction || selectedCommandIndex === null) return;
		removeCommand(selectedAction, selectedCommandIndex);
	}

	function moveCommand(
		action: ServerProfileAction,
		index: number,
		direction: -1 | 1,
	): void {
		const nextIndex = index + direction;
		if (nextIndex < 0 || nextIndex >= action.commands.length) return;
		reorderCommands(action, index, nextIndex);
	}

	function dragCommandStart(event: DragEvent, index: number): void {
		if (editorDisabled) {
			event.preventDefault();
			return;
		}
		draggedCommandIndex = index;
		window.SFX?.play(`drag-start`);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("text/plain", index.toString());
		}
	}

	function dragCommandOver(event: DragEvent): void {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
	}

	function dropCommand(index: number): void {
		if (!selectedAction || draggedCommandIndex === null) return;
		reorderCommands(selectedAction, draggedCommandIndex, index);
		draggedCommandIndex = null;
	}

	function endCommandDrag(): void {
		if (draggedCommandIndex !== null) window.SFX?.play(`snap`);
		draggedCommandIndex = null;
	}

	function reorderCommands(
		action: ServerProfileAction,
		fromIndex: number,
		toIndex: number,
	): void {
		if (editorDisabled) return;
		closeEditorMenu();
		if (fromIndex < 0 || fromIndex >= action.commands.length) return;
		if (toIndex < 0 || toIndex >= action.commands.length) return;
		if (fromIndex === toIndex) {
			window.SFX?.play(`snap`);
			return;
		}
		const commands = [...action.commands];
		const [movedCommand] = commands.splice(fromIndex, 1);
		commands.splice(toIndex, 0, movedCommand);
		action.commands = commands.map(reorderCommand);
		selectedCommandIndex = toIndex;
		touchProfile();
		if (draggedCommandIndex !== null) window.SFX?.play(`reorder`);
	}

	function setCommandType(command: ServerProfileCommand, value: string): void {
		if (editorDisabled) return;
		command.commandType = value as ServerProfileCommandType;
		command.incrementalBan =
			value === `incremental_ban` ?
				(command.incrementalBan ?? structuredClone(initialIncrementalBan))
			:	null;
		if (
			isMessageCommand(command.commandType) ||
			command.commandType === `unban`
		) {
			command.durationHours = null;
			command.offenseType = null;
		} else {
			if (command.commandType === "kick" || command.commandType === "ban") {
				command.durationHours ??= 24;
			} else {
				command.durationHours = null;
			}
		}
		touchProfile();
	}

	function setActionDomain(action: ServerProfileAction, value: string): void {
		if (editorDisabled) return;
		action.actionDomain = value === "server" ? "server" : "player";

		if (action.actionDomain === "server") {
			action.commands = action.commands.map((command, index) => ({
				...command,
				commandType: `` as ServerProfileCommandType,
				incrementalBan: null,
				durationHours: null,
				offenseType: null,
				sortOrder: index,
			}));
		}

		touchProfile();
	}

	function setDuration(command: ServerProfileCommand, value: number): void {
		if (editorDisabled) return;
		command.durationHours = value;
		touchProfile();
	}

	async function insertSelectedCommandTag(tag: string): Promise<void> {
		if (!selectedCommand || !commandMessageInput || editorDisabled) return;
		const insertion = insertMessageTag(
			selectedCommand.message,
			tag,
			commandMessageInput.selectionStart,
			commandMessageInput.selectionEnd,
			180,
		);
		selectedCommand.message = insertion.value;
		touchProfile();
		await tick();
		commandMessageInput.focus();
		commandMessageInput.setSelectionRange(
			insertion.selectionStart,
			insertion.selectionEnd,
		);
	}

	function touchProfile(): void {
		if (!profile) return;
		profile = { ...profile, actions: [...profile.actions] };
	}

	function closeEditorMenu(): void {
		if (menuOwner && $infinityMenuState?.owner === menuOwner)
			closeInfinityMenu();
		menuOwner = null;
		menuTarget = null;
	}

	function actionMenu(event: MouseEvent, action: ServerProfileAction): void {
		menuOwner = event.currentTarget as HTMLElement;
		menuTarget = action;
		openProfileEditorMenu(event, action.label, {
			editable: !editorDisabled,
			canDelete: true,
			onDuplicate: () => {
				const index = profile?.actions.indexOf(action) ?? -1;
				if (!profile || editorDisabled || index < 0) return;
				profile = {
					...profile,
					actions: duplicateAction(profile.actions, index),
				};
			},
			onDelete: () => {
				const index = profile?.actions.indexOf(action) ?? -1;
				if (index >= 0) removeAction(index);
			},
		});
	}

	function commandMenu(
		event: MouseEvent,
		action: ServerProfileAction,
		command: ServerProfileCommand,
	): void {
		menuOwner = event.currentTarget as HTMLElement;
		menuTarget = command;
		openProfileEditorMenu(event, labelCommandType(command.commandType), {
			editable: !editorDisabled,
			canDelete: action.commands.length > 1,
			onDuplicate: () => {
				const index = action.commands.indexOf(command);
				if (editorDisabled || !profile?.actions.includes(action) || index < 0)
					return;
				action.commands = duplicateCommand(action.commands, index);
				touchProfile();
			},
			onDelete: () => {
				const index = action.commands.indexOf(command);
				if (profile?.actions.includes(action) && index >= 0)
					removeCommand(action, index);
			},
		});
	}

	function defaultAction(
		label: string,
		type: ServerProfileCommandType | ``,
		sortOrder: number,
		actionDomain: ServerProfileActionDomain = "player",
	): ServerProfileAction {
		return {
			label,
			description: null,
			actionDomain,
			delayMs: 0,
			sortOrder,
			isEnabled: true,
			iconKey: `circle-info`,
			blockOnMissingVariables: false,
			showInGameServerActions: true,
			commands: [defaultCommand(type, 0)],
		};
	}

	function commandTypesForAction(
		action: ServerProfileAction,
	): ServerProfileCommandType[] {
		return action.actionDomain === "server" ?
				["server_message", "admin_message"]
			:	commandTypes;
	}

	function defaultCommand(
		type: ServerProfileCommandType | ``,
		sortOrder: number,
	): ServerProfileCommand {
		return {
			// Empty types exist only in drafts and are rejected by save validation.
			commandType: type as ServerProfileCommandType,
			...(type === `incremental_ban` ?
				{ incrementalBan: structuredClone(initialIncrementalBan) }
			:	{}),
			sortOrder,
			delayMs: 15,
			durationHours: type === "kick" || type === "ban" ? 24 : null,
			message:
				isMessageCommand(type) ?
					"Please follow server rules."
				:	"[user], please follow server rules.",
			offenseType: null,
		};
	}

	function reorderAction(
		action: ServerProfileAction,
		index: number,
	): ServerProfileAction {
		return { ...action, sortOrder: index };
	}

	function reorderCommand(
		command: ServerProfileCommand,
		index: number,
	): ServerProfileCommand {
		return { ...command, sortOrder: index };
	}

	function labelCommandType(value: ServerProfileCommandType): string {
		if (!value) return `Select action type`
		return (
			value === `server_message` ? `Serversay`
			: value === `admin_message` ? `Adminsay`
			: value === `incremental_ban` ? `Incremental ban`
			: value.replace("_", " ")
		);
	}

	function labelActionDomain(value: ServerProfileActionDomain): string {
		return value === "server" ? "Server action" : "Player action";
	}

	function getError(errorValue: unknown, fallback: string): string {
		return errorValue instanceof Error ? errorValue.message : fallback;
	}

	function isUnavailable(errorValue: unknown): boolean {
		return (
			errorValue instanceof ApiResultError &&
			(errorValue.status === 403 || errorValue.status === 404)
		);
	}
	type ProfileNavigation = {
		view: ProfileView;
		tab: ProfileTab;
		mode: ProfileMode;
		draft: ServerProfileGraph | null;
		actionIndex: number | null;
		commandIndex: number | null;
		profileId: number | null;
		actionId: number | null;
		commandId: number | null;
	};
	function restoreProfileNavigation(state: ProfileNavigation) {
		if (state.view === `overview`) {
			invalidateProfileLoad();
			loadedProfileId = null;
			profile = null;
			mode = `list`;
		}
		if (state.mode === `creating` && state.draft && mode !== `creating`) {
			invalidateProfileLoad();
			initialDraft = state.draft;
			profile = structuredClone(initialDraft);
			mode = `creating`;
			loadedProfileId = null;
			savedProfile = null;
			savedProfileState = ``;
			transferOwnerKey = `${profile.profile.owner.type}:${profile.profile.owner.id}`;
		}
		view = state.view;
		profileTab = state.tab ?? `settings`;
		selectedActionIndex =
			state.actionId ?
				(profile?.actions.findIndex((action) => action.id === state.actionId) ??
				-1)
			:	state.actionIndex;
		if (
			selectedActionIndex !== null &&
			(!profile || !profile.actions[selectedActionIndex])
		) {
			selectedActionIndex = null;
			view = profile ? `profile` : `overview`;
		}
		const action =
			selectedActionIndex === null ? null : (
				profile?.actions[selectedActionIndex]
			);
		selectedCommandIndex =
			state.commandId ?
				(action?.commands.findIndex(
					(command) => command.id === state.commandId,
				) ?? -1)
			:	state.commandIndex;
		if (
			selectedCommandIndex !== null &&
			!action?.commands[selectedCommandIndex]
		) {
			selectedCommandIndex = null;
			if (view === `command`) view = action ? `action` : `profile`;
		}
	}
	rememberNavigation(
		`profileView`,
		(): ProfileNavigation => ({
			view,
			tab: profileTab,
			mode,
			draft: mode === `creating` ? initialDraft : null,
			actionIndex: selectedActionIndex,
			commandIndex: selectedCommandIndex,
			profileId: profile?.profile.id ?? selectedProfileId,
			actionId: selectedAction?.id ?? null,
			commandId: selectedCommand?.id ?? null,
		}),
		(state) => {
			if (state.profileId && state.profileId !== profile?.profile.id) return;
			restoreProfileNavigation(state);
		},
		({ draft, ...route }) => route,
	);
</script>

<section
	{hidden}
	class="panel-view profiles-view"
	class:profiles-view--default={editingDefault}
	aria-label="Profiles"
>
	<PanelHeader
		title={panelTitle}
		eyebrow={view === `overview` ? `Admin` : profileSubtitle}
		leadingIcon={view === "overview" ? null : "fa-arrow-left"}
		leadingLabel="Back"
		leadingDisabled={saving || rulesetSaving}
		onLeading={view === "overview" ? null : back}
	>
		<svelte:fragment slot="trailing">
			{#if view !== "overview"}
				<Button
					label="Cancel"
					disabled={saving || rulesetSaving}
					onClick={() => void cancelProfile()}
				/>
				<Button
					label="Save"
					variant="primary"
					disabled={saving || rulesetSaving || !profile || !canEditProfile}
					onClick={() => void saveProfile()}
				/>
			{:else}
				<IconButton
					icon="fa-rotate"
					ariaLabel="Refresh profiles"
					disabled={!selectedOwner || loading || saving}
					onClick={() => void refreshProfiles()}
				/>
			{/if}
		</svelte:fragment>
	</PanelHeader>

	{#if editingDefault}
		<aside class="profile-default-notice" role="note">
			<Icon
				name="fa-triangle-exclamation"
				tone="var(--color-accent-tertiary)"
			/>
			<p>
				<strong>You're editing the default profile.</strong> Saved changes affect
				everyone using Default.
			</p>
		</aside>
	{/if}

	<div
		class="profiles-view__body"
		use:navigationScroll={`profiles-view__body`}
		class:profiles-view__body--overview={view === "overview"}
	>
		{#if view === "overview"}
			<div class="profile-admin-select">
				<Select
					label="Profile owner"
					options={profileOwnerSelectOptions}
					value={selectedOwnerKey}
					placeholder="Select owner"
					onChange={selectOwner}
					disabled={saving}
				/>
			</div>
		{/if}

		{#if !selectedOwner}
			<div class="profile-screen">
				<EmptyState
					title="No owner selected"
					message="Choose Personal or one of your teams."
				/>
			</div>
		{:else if view === "overview"}
			<div class="profile-screen grid-stack gap-125">
				<div class="profile-primary-action">
					<Button
						label="Make a new profile"
						icon="fa-plus"
						variant="primary"
						disabled={saving || loading || !canCreateProfile}
						onClick={() => void openSourceModal(`create`)}
					/>
				</div>
				{#each summaries as summary (summary.profile.id)}
					<div
						class="profile-summary"
						class:profile-summary--selected={$infinityMenuState?.owner?.dataset
							.profileSummaryId === `${summary.profile.id}`}
						class:profile-summary--disabled={summary.isEnabledForUser === false}
						data-profile-summary
						data-profile-summary-id={summary.profile.id}
						role="button"
						tabindex="0"
						on:click={(event) => openSummaryFromRow(event, summary)}
						on:keydown={(event) => openSummaryFromKeyboard(event, summary)}
						on:contextmenu={(event) => openSummaryMenu(event, summary)}
					>
						<Tile
							title={summary.profile.name}
							onClick={() =>
								void navigation.visit(() => openProfile(summary.profile.id))}
							icon="fa-layer-group"
							subtitle={`${summary.profile.isMaster ? `All` : summary.serverCount} servers / ${summary.enabledActionCount}/${summary.actionCount} actions / ${summary.commandCount} commands / ${summary.enabledRuleCount}/${summary.ruleCount} rules`}
							suffix={[
								summary.profile.isMaster && `Master Profile`,
								summary.profile.isDefault && `Default`,
								summary.profile.isPreset && `Preset`,
								summary.isEnabledForUser === false && `Disabled`,
							]
								.filter(Boolean)
								.join(` / `)}
						/>
					</div>
				{:else}
					<EmptyState
						title="No profiles"
						message="Refresh to create the default profile."
					/>
				{/each}
			</div>
		{:else if view === "profile" && profile}
			<div class="profile-screen grid-stack gap-125">
				<Tabs
					items={profileTabs}
					value={profileTab}
					label="Profile sections"
					disabled={saving || rulesetSaving}
					onChange={async (value) => {
						if (rulesetPanel?.isDirty() && !(await unsavedChanges.canLeave()))
							return;
						await navigation.visit(() => {
							closeEditorMenu();
							profileTab = value as ProfileTab;
						});
					}}
				>
					{#if profileTab === `settings`}
						<section class="profile-card grid-stack gap-125">
							<div class="profile-card-header">
								<h2>Profile</h2>
								<div class="grid-cluster gap-075">
									<Button
										label="Restore"
										size="sm"
										disabled={saving || loading || !canEditProfile}
										onClick={() => void openSourceModal(`restore`)}
									/>
									{#if !profile.profile.isDefault && !profile.profile.isMaster && mode !== "creating"}
										<Button
											label="Delete"
											variant="danger"
											size="sm"
											disabled={saving || !canDeleteProfile}
											onClick={() => void removeProfile()}
										/>
									{/if}
								</div>
							</div>
							<Input
								label="Name"
								value={profile.profile.name}
								disabled={profile.profile.isDefault || editorDisabled}
								maxlength={255}
								onChange={setProfileName}
							/>
							<Input
								label="Description"
								value={profile.profile.description ?? ""}
								disabled={saving || !canEditProfile}
								maxlength={255}
								onChange={setProfileDescription}
							/>
							{#if $authState.user?.isSuperadmin && !profile.profile.isDefault && !profile.profile.isMaster}
								<Toggle
									label="Preset"
									description={profile.profile.isPreset ? `Yes` : `No`}
									tooltip="Make this profile available for all admins to copy. Changes apply when you save."
									checked={profile.profile.isPreset === true}
									disabled={editorDisabled}
									onChange={(value) => {
										if (profile) profile.profile.isPreset = value;
									}}
								/>
							{:else if profile.profile.isPreset}
								<small
									>Only superadmins can edit this preset. Duplicate it to make
									your own changes.</small
								>
							{/if}
							{#if mode === "editing" && !profile.profile.isDefault && !profile.profile.isMaster}
								<Select
									label="Transfer profile"
									options={transferOwnerSelectOptions}
									value={transferOwnerKey}
									disabled={saving || !canTransferProfile}
									hint={(
										Math.max(
											savedProfile?.servers.length ?? 0,
											profile.servers.length,
										) > 0
									) ?
										`Remove attached servers and save before transferring ownership involving a team.`
									:	null}
									onChange={(value) => (transferOwnerKey = value)}
								/>
							{/if}
						</section>

						{#if profile.profile.isMaster}
							<p>Rules apply to all game servers.</p>
						{:else}
						<section class="profile-card grid-stack gap-125">
							<div class="profile-card-header">
								<h2>
									Team Servers
									<HelpHint
										text={profile.profile.owner.type === `team` ?
											`Attach this profile to servers already claimed by its team.`
										:	`Choose servers owned by your teams. You can attach one of your private profiles to each server.`}
									/>
								</h2>
								<small>{profile.servers.length} servers attached</small>
							</div>
							{#if profile.profile.owner.type === `team`}
								<small
									>To move a server from another profile, remove it there and
									save, then add it here and save.</small
								>
							{/if}
							{#if serverOptions.length > 0}
								<MultiSelect
									ariaLabel="Select servers for this profile"
									options={serverOptions}
									value={selectedServerValues}
									disabled={editorDisabled || profile.profile.isDefault}
									onChange={setSelectedServers}
								/>
							{:else}
								<small
									>{profile.profile.owner.type === `team` ?
										`Claim servers in Teams → Claimed servers first.`
									:	`No available servers belong to your teams.`}</small
								>
							{/if}
						</section>
						{/if}
					{:else if profileTab === `actions`}
						<section class="profile-card grid-stack gap-125">
							<div class="profile-card-header">
								<h2>
									Actions
									<HelpHint
										text="Each action can contain one or more commands. Action buttons are available in your game servers."
									/>
								</h2>
								<Button
									label="New action"
									icon="fa-plus"
									size="sm"
									disabled={saving || !canEditProfile}
									onClick={addAction}
								/>
							</div>
							{#each profile.actions as action, actionIndex (action)}
								{@const actionIcon = profileActionIcon(action)}
								<button
									class="profile-row-button profile-row-button--action"
									class:profile-row-button--selected={menuTarget === action &&
										$infinityMenuState?.owner === menuOwner}
									class:profile-row-button--dragging={draggedActionIndex ===
										actionIndex}
									type="button"
									draggable={!editorDisabled}
									data-uisfx="open"
									on:contextmenu={(event) => actionMenu(event, action)}
									on:dragstart={(event) => dragActionStart(event, actionIndex)}
									on:dragover={dragActionOver}
									on:drop={() => dropAction(actionIndex)}
									on:dragend={endActionDrag}
									on:click={() => openAction(actionIndex)}
								>
									<span class="profile-action-icon">
										<Icon
											name={actionIcon.name}
											type={actionIcon.type}
											tone={profileActionIconColor(action)}
										/>
									</span>
									<strong>{action.label}</strong>
									<small
										>{labelActionDomain(action.actionDomain)} / {action.commands
											.length} command{action.commands.length === 1 ? "" : "s"} /
										{action.isEnabled ? "enabled" : "disabled"}</small
									>
								</button>
							{:else}
								<EmptyState
									title="No actions"
									message="Add an action or use Restore to copy actions from another profile."
								/>
							{/each}
						</section>
					{:else if profile.profile.id}{#key profile.profile.id}<RulesetPanel
								bind:this={rulesetPanel}
								bind:saving={rulesetSaving}
								profileId={profile.profile.id}
								actions={savedProfile?.actions ?? []}
								disabled={editorDisabled}
								isDefault={profile.profile.isDefault}
								previewServers={profile.profile.isMaster ? gameServers.filter(server => !server.deletedAt).map(server => ({
									value: String(server.id), label: server.displayName || server.name,
								})) : serverOptions.filter(
									(option) =>
										!option.disabled &&
										savedProfile?.servers.some(
											(server) => String(server.gameServerId) === option.value,
										),
								)}
								onCounts={(active, total) => {
									if (
										profile &&
										(ruleSummary?.enabledRuleCount !== active ||
											ruleSummary?.ruleCount !== total)
									)
										summaries = summaries.map((item) =>
											item.profile.id === profile?.profile.id ?
												{ ...item, enabledRuleCount: active, ruleCount: total }
											:	item,
										);
								}}
							/>{/key}{:else}<p>Save this profile before adding rules.</p>{/if}
				</Tabs>
			</div>
		{:else if view === "action" && profile && selectedAction && selectedActionIndex !== null}
			<div class="profile-screen grid-stack gap-125">
				<fieldset
					class="profile-card grid-stack gap-125"
					disabled={editorDisabled}
				>
					<div class="profile-card-header">
						<h2>Action</h2>
						<div class="grid-cluster gap-05">
							<Button
								label="Up"
								sfx="reorder"
								size="sm"
								disabled={selectedActionIndex === 0}
								onClick={() => moveSelectedAction(-1)}
							/>
							<Button
								label="Down"
								sfx="reorder"
								size="sm"
								disabled={selectedActionIndex === profile.actions.length - 1}
								onClick={() => moveSelectedAction(1)}
							/>
							<Button
								label="Remove"
								size="sm"
								variant="danger"
								onClick={removeSelectedAction}
							/>
						</div>
					</div>
					<Select
						label="Action domain"
						options={actionDomainOptions}
						value={selectedAction.actionDomain}
						onChange={(value) => setActionDomain(selectedAction, value)}
					/>
					<Input
						label="Name"
						value={selectedAction.label}
						maxlength={255}
						onChange={setActionLabel}
					/>
					<Input
						label="Description"
						value={selectedAction.description ?? ""}
						maxlength={255}
						onChange={setActionDescription}
					/>
					<Input
						label="Extra delay for every command (ms)"
						type="number"
						value={selectedAction.delayMs}
						min={0}
						step={15}
						onChange={setActionDelay}
					/>
					<div class="profile-action-icon-picker">
						<Icon
							name={profileActionIcon(selectedAction).name}
							type={profileActionIcon(selectedAction).type}
							tone={profileActionIconColor(selectedAction)}
						/>
						<Select
							label="Icon"
							options={iconOptions}
							value={selectedAction.iconKey}
							onChange={setActionIcon}
						/>
					</div>
					<Checkbox
						checked={selectedAction.isEnabled}
						label="Enabled"
						onChange={setActionEnabled}
					/>
					<Toggle
						checked={selectedAction.showInGameServerActions !== false}
						label="Show in game server actions"
						onChange={setActionVisibility}
					/>
					<Checkbox
						checked={selectedAction.blockOnMissingVariables}
						label="Block action if server variables are missing"
						onChange={setActionVariableGuard}
					/>
				</fieldset>

				<section class="profile-card grid-stack gap-125">
					<div class="profile-card-header">
						<h2>
							Commands
							<HelpHint
								text="In-game commands are executed in order when the action is triggered."
							/>
						</h2>
						<Button
							label="New command"
							icon="fa-plus"
							size="sm"
							disabled={editorDisabled}
							onClick={() => addCommand(selectedAction)}
						/>
					</div>
					{#each selectedAction.commands as command, commandIndex (command)}
						<button
							class="profile-row-button"
							class:profile-row-button--selected={menuTarget === command &&
								$infinityMenuState?.owner === menuOwner}
							class:profile-row-button--dragging={draggedCommandIndex ===
								commandIndex}
							type="button"
							draggable={!editorDisabled}
							data-uisfx="open"
							on:contextmenu={(event) =>
								commandMenu(event, selectedAction, command)}
							on:dragstart={(event) => dragCommandStart(event, commandIndex)}
							on:dragover={dragCommandOver}
							on:drop={() => dropCommand(commandIndex)}
							on:dragend={endCommandDrag}
							on:click={() => openCommand(commandIndex)}
						>
							<strong>{labelCommandType(command.commandType)}</strong>
							<small
								>+{command.delayMs}ms / {(
									command.commandType === `incremental_ban`
								) ?
									`${command.incrementalBan?.stages.length ?? 0} stages`
								: command.durationHours === 999999 ? "MAX"
								: (command.durationHours ?? "no time")}</small
							>
						</button>
					{/each}
				</section>
			</div>
		{:else if view === "command" && selectedAction && selectedCommand && selectedCommandIndex !== null}
			<fieldset
				class="profile-screen grid-stack gap-125"
				disabled={editorDisabled}
			>
				<section class="profile-card grid-stack gap-125">
					<div class="profile-card-header">
						<h2>Command</h2>
						<div class="grid-cluster gap-05">
							<Button
								label="Up"
								sfx="reorder"
								size="sm"
								disabled={selectedCommandIndex === 0}
								onClick={() => moveSelectedCommand(-1)}
							/>
							<Button
								label="Down"
								sfx="reorder"
								size="sm"
								disabled={selectedCommandIndex ===
									selectedAction.commands.length - 1}
								onClick={() => moveSelectedCommand(1)}
							/>
							<Button
								label="Remove"
								size="sm"
								variant="danger"
								disabled={selectedAction.commands.length <= 1}
								onClick={removeSelectedCommand}
							/>
						</div>
					</div>
					<div
						class="command-fields"
						class:command-fields--offense={!isMessageCommand(
							selectedCommand.commandType,
						) && selectedCommand.commandType !== `unban`}
					>
						<Select
							label="Action type"
							placeholder="Select action type"
							required
							options={commandTypeOptions}
							value={selectedCommand.commandType}
							onChange={(value) => setCommandType(selectedCommand, value)}
						/>
						{#if Boolean(selectedCommand.commandType) && !isMessageCommand(selectedCommand.commandType) && selectedCommand.commandType !== `unban`}
							<Select
								label="Offense type"
								required
								placeholder="Select type"
								options={offenseTypeOptions}
								value={selectedCommand.offenseType ?? ``}
								onChange={setCommandOffenseType}
							/>
						{/if}
						<Input
							label="Delay (ms)"
							type="number"
							value={selectedCommand.delayMs}
							min={15}
							step={15}
							onChange={setCommandDelay}
						/>
					</div>

					{#if selectedCommand.commandType === `ban` || selectedCommand.commandType === `kick`}
						<BanDuration
							value={selectedCommand.durationHours ?? 24}
							disabled={editorDisabled}
							steps={durationSteps}
							allowOutOfStep={true}
							onChange={(value) => setDuration(selectedCommand, value)}
						/>
					{:else if selectedCommand.commandType === `incremental_ban`}
						<IncrementalBanEditor
							value={selectedCommand.incrementalBan ??
								structuredClone(initialIncrementalBan)}
							offenseOptions={offenseTypeOptions}
							disabled={editorDisabled}
							onChange={(value) => {
								if (!selectedCommand || editorDisabled) return;
								selectedCommand.incrementalBan = value;
								touchProfile();
							}}
						/>
					{/if}

					<Textarea
						bind:element={commandMessageInput}
						label="Message"
						value={selectedCommand.message}
						maxlength={180}
						rows={4}
						hint={commandMessageCount ? `${commandMessageCount} characters` : null}
						onChange={setCommandMessage}
					/>
					<CommandMessageSupport
						bind:characterCount={commandMessageCount}
						personal={profile?.profile.owner.type === `user`}
						command={selectedCommand}
						commands={selectedAction.commands}
						variables={profile?.availableVariables ?? []}
						playerAction={selectedAction.actionDomain === `player`}
						onSelect={insertSelectedCommandTag}
					/>
					<small
						>Server variables are managed <a
							href="#servers"
							on:click|preventDefault={onOpenYourServers}>Per server</a
						>.</small
					>
				</section>
			</fieldset>
		{/if}
	</div>
</section>

{#if sourceModal}
	<ProfileSourceModal
		mode={sourceModal.mode}
		owner={sourceModal.owner}
		owners={ownerOptions}
		onSelect={(source) =>
			void navigation.visit(() => applyProfileSource(source))}
		onCancel={() => (sourceModal = null)}
	/>
{/if}

<style lang="scss">
	.command-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 15%;
		gap: var(--gutter-md);
	}

	.command-fields--offense {
		grid-template-columns: repeat(2, minmax(0, 1fr)) 15%;
	}

	fieldset.profile-card {
		margin: 0;
	}
	fieldset.profile-screen {
		border: 0;
		margin: 0;
	}
	.profile-row-button--selected {
		outline: 1px solid var(--color-accent-primary);
	}
	.profiles-view {
		box-sizing: border-box;
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
		padding-top: var(--gutter-lg);
		overflow: hidden;
	}

	.profiles-view--default {
		grid-template-rows: auto auto minmax(0, 1fr);
	}

	.profile-default-notice {
		display: flex;
		align-items: center;
		gap: var(--gutter-md);
		margin: 0 var(--gutter-lg);
		padding: var(--gutter-md);
		border: 1px solid rgbaa(var(--color-accent-tertiary), 0.35);
		border-radius: var(--radius);
		background: rgbaa(var(--color-accent-tertiary), 0.06);
		color: var(--color-light-secondary);
		font-size: var(--font-size-sm);
	}

	.profile-default-notice p {
		margin: 0;
	}
	.profile-default-notice strong {
		color: var(--color-accent-tertiary);
	}

	.profiles-view__body {
		min-height: 0;
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		gap: var(--gutter-lg);
	}

	.profiles-view__body--overview {
		grid-template-rows: auto minmax(0, 1fr);
	}

	small {
		color: var(--color-text-secondary);
	}

	.profile-admin-select {
		margin: 0 var(--gutter-lg);
	}

	.profile-admin-select,
	.profile-card {
		min-width: 0;
		display: grid;
		gap: var(--gutter-md);
	}

	.profile-screen {
		min-height: 0;
		padding: 0 var(--gutter-lg) var(--gutter-lg);
		overflow: auto;
	}

	.profile-card,
	.profile-row-button {
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		background: rgba(3, 12, 18, 0.28);
	}

	.profile-row-button {
		display: grid;
		gap: 6px;
		padding: 12px;
		text-align: left;
	}

	.profile-summary {
		display: grid;
		gap: 6px;
		border-radius: var(--radius);
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		cursor: pointer;
	}

	.profile-summary:focus-visible {
		outline: 2px solid var(--color-accent-secondary);
		outline-offset: 2px;
	}

	.profile-summary--selected {
		background-color: rgbaa(var(--color-dark-secondary), 0.1);
	}

	.profile-summary--disabled {
		opacity: 0.62;
	}

	.profile-row-button {
		grid-template-columns: minmax(0, 1fr);
		align-items: center;
		cursor: grab;
	}

	.profile-row-button--action {
		grid-template-columns: auto minmax(0, 1fr);
	}

	.profile-action-icon {
		grid-row: span 2;
		display: grid;
		place-items: center;
	}

	.profile-row-button:active {
		cursor: grabbing;
	}

	.profile-row-button--dragging {
		opacity: 0.52;
		border-color: rgba(34, 221, 160, 0.58);
	}

	.profile-row-button strong,
	.profile-card h2 {
		color: var(--color-light-primary);
	}

	.profile-row-button small,
	.profile-card small {
		color: var(--color-text-secondary);
	}

	.profile-card {
		padding: 12px;
	}

	.profile-card-header {
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.profile-card-header h2 {
		margin: 0;
		font-size: 16px;
	}

	.profile-action-icon-picker {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: end;
		gap: var(--gutter-md);
	}

	.profile-primary-action {
		width: 100%;
	}

	.profile-primary-action :global(.ui-button) {
		width: 100%;
	}
</style>

<script lang="ts">
	import { onDestroy } from "svelte"
	import { unsavedChanges } from "$lib/utils/unsavedChanges"
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
		ServerProfileSummary,
	} from "$lib/core";
	import { serverProfileActionIcons } from "$lib/core";
	import type { FormOption } from "$lib/types/ui";
	import { User } from "$lib/auth/user";
	import { authState } from "$lib/auth/user"
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
		fetchServerProfile,
		updateServerProfile,
	} from "$lib/utils/serverProfilesApi";
	import { getAllServers } from "$lib/utils/gameServersApi";
	import { gameServerRevision } from "$lib/stores/gameServersStore";
	import { ApiResultError } from "$lib/utils/apiResult"
	import {
		buildProfileServerOptions,
		reconcileProfileServerAssignments,
	} from "$lib/utils/profileManagement";
	import { variableTagEntries } from "$lib/utils/serverVariables";
	import {
		profileActionIcon,
		profileActionIconColor,
	} from "$lib/utils/profileActions";
	import {
		insertMessageTag,
		messageTagDefinitions,
	} from "$lib/utils/messageTags";
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import MultiSelect from "$lib/components/ui/MultiSelect.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Range from "$lib/components/ui/Range.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import Textarea from "$lib/components/ui/Textarea.svelte";
	import VariableTagPicker from "./VariableTagPicker.svelte";
	import ProfileSourceModal from "./ProfileSourceModal.svelte"
	import { canManageProfile, duplicateAction, duplicateCommand, newProfileDraft, profileChanges, profileInput, replaceProfileActions, uniqueNewName } from "./profileEditor"
	import { openProfileEditorMenu } from "./profileEditorMenu"
	import { closeInfinityMenu, infinityMenuState } from "$lib/components/ui/infinityMenu"

	export let onOpenYourServers: () => void
	export let hidden = false;
	export let isActive = false;
	export let selectedOwner: ProfileOwner | null = null;
	export let selectedProfileId: number | null = null;
	export let onSelectProfile: (profileId: number | null) => void;
	export let onSelectOwner: (owner: ProfileOwner) => void;

	type ProfileMode = "list" | "editing" | "creating";
	type ProfileView = "overview" | "profile" | "action" | "command";

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
		"warn",
		"kick",
		"ban",
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
	let savedProfileState = ``
	let ownerOptionsRevision = 0
	let profilesRevision = 0
	let profileRevision = 0
	let savedProfile: ServerProfileGraph | null = null
	let sourceModal: { mode: `create` | `restore`, owner: ProfileOwner, profileId: number | null } | null = null
	let menuOwner: HTMLElement | null = null
	let menuTarget: ServerProfileAction | ServerProfileCommand | null = null
	onDestroy(unsavedChanges.register(() => Boolean(profile && canEditProfile && profileState() !== savedProfileState)))
	onDestroy(closeEditorMenu)

	function profileState(): string {
		return profile ? JSON.stringify([profileInput(profile), transferOwnerKey]) : ``
	}

	$: selectedServerIds = new Set(
		profile?.servers.map((server) => server.gameServerId) ?? [],
	);

	$: serverOptions = buildProfileServerOptions(
		gameServers,
		assignments,
		profile?.profile.id ?? null,
		selectedOwner,
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
	$: commandMessageTags = [
		...messageTagDefinitions.map((definition) => ({
			tag: definition.tag,
			tooltip: definition.description,
		})),
		...variableTagEntries(profile?.availableVariables ?? []).map(
			(variable) => ({
				tag: variable.tag,
				tooltip: variable.label,
			}),
		),
	].filter(
		(item, index, items) =>
			items.findIndex((candidate) => candidate.tag === item.tag) === index,
	);

	$: selectedOwnerKey =
		selectedOwner ? `${selectedOwner.type}:${selectedOwner.id}` : "";
	$: panelTitle =
		view === "overview" ? "Profiles"
		: view === "profile" ? (profile?.profile.name ?? "Profile")
		: view === "action" ? (selectedAction?.label ?? "Action")
		: labelCommandType(selectedCommand?.commandType ?? "server_message");
	$: selectedProfilesKey = `${selectedOwnerKey}:${$gameServerRevision}`;
	$: canCreateProfile = canManageProfile(selectedOwner, `create`, $authState.user, ownerOptions)
	$: canEditProfile = canManageProfile(profile?.profile.owner ?? null, mode === `creating` ? `create` : `edit`, $authState.user, ownerOptions)
	$: canDeleteProfile = Boolean(profile && !profile.profile.isDefault && canManageProfile(profile.profile.owner, `delete`, $authState.user, ownerOptions))
	$: editorDisabled = saving || !canEditProfile
	$: profileSubtitle = profile?.profile.isDefault ? `Default profile`
		: profile?.profile.owner.type === `team` ? `Team profile: ${ownerOptions.find(owner => owner.type === `team` && owner.id === profile?.profile.owner.id)?.name ?? `Team ${profile.profile.owner.id}`}`
		: `Personal profile`
	$: canTransferProfile =
		mode === "editing" &&
		canDeleteProfile
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
	}));
	$: actionDomainOptions = actionDomains.map((domain) => ({ ...domain }));
	$: iconOptions = serverProfileActionIcons.map((icon) => ({
		value: icon.key,
		label: icon.label,
	}));
	$: commandTypeOptions = selectedAction ? commandTypesForAction(selectedAction).map((type) => ({
		value: type,
		label: labelCommandType(type),
	})) : [];
	$: offenseTypeOptions = offenseTypes.map((offenseType) => ({
		value: offenseType,
		label: offenseType.replace("_", " "),
	}));

	$: if (isActive && !ownerOptionsLoaded) {
		void loadOwnerOptions();
	}
	$: if (!isActive || hidden) {
		sourceModal = null
		closeEditorMenu()
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
		void openProfile(selectedProfileId);
	}

	async function loadOwnerOptions(): Promise<void> {
		const revision = ++ownerOptionsRevision
		try {
			const loadedOwners = await fetchProfileOwners()
			if (revision !== ownerOptionsRevision) return
			ownerOptions = loadedOwners
			User.Ability.setOwners(ownerOptions);
			if (selectedOwner && !ownerOptions.some(owner => owner.type === selectedOwner?.type && owner.id === selectedOwner?.id)) {
				clearProfileSelection()
				const fallback = ownerOptions.find(owner => owner.type === `user`) ?? ownerOptions[0]
				if (fallback) onSelectOwner({ type: fallback.type, id: fallback.id })
			}
			ownerOptionsLoaded = true;
		} catch (loadError) {
			if (revision !== ownerOptionsRevision) return
			notifyError(getError(loadError, "Profile owners failed."), {
				dedupeKey: "profiles:owner-options",
			});
		}
	}

	function clearProfileSelection(): void {
		sourceModal = null
		closeEditorMenu()
		profilesRevision += 1
		profileRevision += 1
		loading = false
		profile = null
		summaries = []
		mode = `list`
		view = `overview`
		selectedActionIndex = null
		selectedCommandIndex = null
		loadedProfilesKey = ``
		loadedProfileId = null
		onSelectProfile(null)
	}

	async function clearUnavailableSelection(): Promise<void> {
		const unavailableOwnerKey = selectedProfilesKey
		clearProfileSelection()
		loadedProfilesKey = unavailableOwnerKey
		ownerOptionsLoaded = false
		await loadOwnerOptions()
	}

	async function refreshProfiles(profileOwner = selectedOwner): Promise<void> {
		if (!profileOwner) return;
		const ownerKey = `${profileOwner.type}:${profileOwner.id}`
		const revision = ++profilesRevision
		loading = true;

		try {
			const [profileSummaries, servers, profileAssignments] = await Promise.all(
				[
					fetchProfileSummaries(profileOwner),
					getAllServers({
						official: false,
						deleted: `active`,
						includeMainMenu: false,
					}),
					fetchProfileAssignments(),
				],
			);
			if (revision !== profilesRevision || selectedOwnerKey !== ownerKey) return
			summaries = profileSummaries;
			gameServers = servers;
			assignments = profileAssignments;
		} catch (loadError) {
			if (revision !== profilesRevision || selectedOwnerKey !== ownerKey) return
			if (isUnavailable(loadError)) {
				notifyError(getError(loadError, "Profiles request failed."), { dedupeKey: "profiles:list" })
				await clearUnavailableSelection()
				return
			}
			notifyError(getError(loadError, "Profiles request failed."), {
				dedupeKey: "profiles:list",
			});
		} finally {
			if (revision === profilesRevision) loading = false;
		}
	}

	async function selectOwner(value: string): Promise<void> {
		if (!(await unsavedChanges.canLeave())) return
		const owner = ownerOptions.find(
			(option) => `${option.type}:${option.id}` === value,
		);
		if (!owner) return;
		sourceModal = null
		closeEditorMenu()
		onSelectOwner({ type: owner.type, id: owner.id });
		profile = null;
		mode = "list";
		view = "overview";
		selectedActionIndex = null;
		selectedCommandIndex = null;
		loadedProfilesKey = "";
		loadedProfileId = null;
		onSelectProfile(null);
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
		const icon = serverProfileActionIcons.find((candidate) => candidate.key === value);
		if (!icon) return;
		selectedAction.iconKey = icon.key;
		touchProfile();
	}

	function setActionEnabled(value: boolean): void {
		if (!selectedAction || editorDisabled) return;
		selectedAction.isEnabled = value;
		touchProfile();
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
		if (!selectedCommand || editorDisabled || !offenseTypes.includes(value as PlayerOffenseType)) return;
		selectedCommand.offenseType = value as PlayerOffenseType;
		touchProfile();
	}

	async function openProfile(profileId: number, discardConfirmed = false): Promise<void> {
		if (!selectedOwner) return;
		if (!discardConfirmed && !(await unsavedChanges.canLeave())) return
		const ownerKey = selectedOwnerKey
		const revision = ++profileRevision
		loading = true;

		try {
			const loadedProfile = await fetchServerProfile(selectedOwner, profileId)
			if (revision !== profileRevision || selectedOwnerKey !== ownerKey) return
			profile = loadedProfile
			savedProfile = structuredClone(loadedProfile)
			loadedProfileId = profileId;
			transferOwnerKey =
				profile.profile.owner.type === "system" ?
					selectedOwnerKey
				:	`${profile.profile.owner.type}:${profile.profile.owner.id}`;
			mode = "editing";
			view = "profile";
			selectedActionIndex = null;
			selectedCommandIndex = null;
			savedProfileState = profileState()
			onSelectProfile(profileId);
		} catch (loadError) {
			if (revision !== profileRevision || selectedOwnerKey !== ownerKey) return
			if (isUnavailable(loadError)) {
				notifyError(getError(loadError, "Profile request failed."), { dedupeKey: `profiles:open:${profileId}` })
				await clearUnavailableSelection()
				return
			}
			notifyError(getError(loadError, "Profile request failed."), {
				dedupeKey: `profiles:open:${profileId}`,
			});
		} finally {
			if (revision === profileRevision) loading = false;
		}
	}

	async function openSourceModal(sourceMode: `create` | `restore`): Promise<void> {
		if (!selectedOwner || saving || loading || (sourceMode === `create` ? !canCreateProfile : !canEditProfile)) return
		if (sourceMode === `create` && !(await unsavedChanges.canLeave())) return
		closeEditorMenu()
		sourceModal = { mode: sourceMode, owner: { ...selectedOwner }, profileId: profile?.profile.id ?? null }
	}

	function applyProfileSource(source: ServerProfileGraph | null): void {
		const target = sourceModal
		sourceModal = null
		if (!target || saving || `${target.owner.type}:${target.owner.id}` !== selectedOwnerKey) return
		profileRevision += 1
		loading = false
		if (target.mode === `restore`) {
			if (!profile || !canEditProfile || profile.profile.id !== target.profileId) return
			profile = replaceProfileActions(profile, source?.actions ?? [])
			view = `profile`
			selectedActionIndex = null
			selectedCommandIndex = null
			return
		}
		if (!canCreateProfile) return
		savedProfile = null
		savedProfileState = ``
		profile = newProfileDraft(target.owner, source, summaries.map(summary => summary.profile.name))
		loadedProfileId = null;
		transferOwnerKey = selectedOwnerKey;
		mode = "creating";
		view = "profile";
		selectedActionIndex = null;
		selectedCommandIndex = null;
		onSelectProfile(null);
	}

	async function saveProfile(): Promise<void> {
		if (!selectedOwner || !profile || !canEditProfile) return;
		saving = true;

		try {
			const input = mode === `creating` || !savedProfile ? profileInput(profile) : profileChanges(profile, savedProfile)
			const transferOwner = ownerOptions.find(
				(option) => `${option.type}:${option.id}` === transferOwnerKey,
			);

			if (
				mode === "editing" &&
				!profile.profile.isDefault &&
				transferOwner &&
				`${transferOwner.type}:${transferOwner.id}` !== selectedOwnerKey
			) {
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
			savedProfile = structuredClone(profile)
			savedProfileState = profileState()
			if (savedOwnerKey !== selectedOwnerKey) onSelectOwner(savedOwner);
			onSelectProfile(profile.profile.id);
			notifySuccess("Profile saved.");
			await refreshProfiles(savedOwner);
		} catch (saveError) {
			if (isUnavailable(saveError)) {
				void clearUnavailableSelection()
			}
			notifyError(getError(saveError, "Profile save failed."));
		} finally {
			saving = false;
		}
	}

	async function cancelProfile(): Promise<void> {
		if (!(await unsavedChanges.canLeave())) return
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
		closeEditorMenu()
		if (view === "command") {
			view = "action";
			selectedCommandIndex = null;
			return;
		}

		if (view === "action") {
			view = "profile";
			selectedActionIndex = null;
			selectedCommandIndex = null;
			return;
		}

		if (!(await unsavedChanges.canLeave())) return
		profile = null;
		mode = "list";
		view = "overview";
		selectedActionIndex = null;
		selectedCommandIndex = null;
		onSelectProfile(null);
	}

	async function removeProfile(): Promise<void> {
		if (!selectedOwner || !profile || saving || !canDeleteProfile) return
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
			if (isUnavailable(deleteError)) void clearUnavailableSelection()
			notifyError(getError(deleteError, "Profile delete failed."));
		} finally {
			saving = false;
		}
	}

	function openAction(index: number): void {
		closeEditorMenu()
		selectedActionIndex = index;
		selectedCommandIndex = null;
		view = "action";
	}

	function openCommand(index: number): void {
		closeEditorMenu()
		selectedCommandIndex = index;
		view = "command";
	}

	function setSelectedServers(values: string[]): void {
		if (!profile || !selectedOwner || editorDisabled) return;
		const activeProfile = profile;
		const selectedIds = new Set(values.map(Number));
		profile.servers = reconcileProfileServerAssignments(
			activeProfile.servers,
			gameServers,
			selectedIds,
			selectedOwner,
			activeProfile.profile.id,
		);
		profile = { ...profile };
	}

	function addAction(): void {
		if (!profile || editorDisabled) return;
		const names = profile.actions.map(action => action.label)
		profile.actions = [
			...profile.actions,
			defaultAction(
				uniqueNewName(`New action`, names),
				"server_message",
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
			event.preventDefault()
			return
		}
		draggedActionIndex = index;
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
		draggedActionIndex = null;
	}

	function reorderActions(fromIndex: number, toIndex: number): void {
		if (!profile || editorDisabled || fromIndex === toIndex) return;
		closeEditorMenu()
		if (fromIndex < 0 || fromIndex >= profile.actions.length) return;
		if (toIndex < 0 || toIndex >= profile.actions.length) return;
		const actions = [...profile.actions];
		const [movedAction] = actions.splice(fromIndex, 1);
		actions.splice(toIndex, 0, movedAction);
		profile.actions = actions.map(reorderAction);
		selectedActionIndex = toIndex;
		profile = { ...profile };
	}

	function addCommand(action: ServerProfileAction): void {
		if (editorDisabled) return
		action.commands = [
			...action.commands,
			defaultCommand("server_message", action.commands.length),
		];
		touchProfile();
		openCommand(action.commands.length - 1);
	}

	function removeCommand(action: ServerProfileAction, index: number): void {
		if (editorDisabled || action.commands.length <= 1 || !action.commands[index]) return;
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
			event.preventDefault()
			return
		}
		draggedCommandIndex = index;
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
		draggedCommandIndex = null;
	}

	function reorderCommands(
		action: ServerProfileAction,
		fromIndex: number,
		toIndex: number,
	): void {
		if (editorDisabled || fromIndex === toIndex) return
		closeEditorMenu()
		if (fromIndex < 0 || fromIndex >= action.commands.length) return;
		if (toIndex < 0 || toIndex >= action.commands.length) return;
		const commands = [...action.commands];
		const [movedCommand] = commands.splice(fromIndex, 1);
		commands.splice(toIndex, 0, movedCommand);
		action.commands = commands.map(reorderCommand);
		selectedCommandIndex = toIndex;
		touchProfile();
	}

	function setCommandType(command: ServerProfileCommand, value: string): void {
		if (editorDisabled) return
		command.commandType = value as ServerProfileCommandType;
		if (command.commandType === "server_message" || command.commandType === `unban`) {
			command.durationHours = null;
			command.offenseType = null;
		} else {
			command.offenseType ??= "other";
			if (command.commandType === "kick" || command.commandType === "ban") {
				command.durationHours ??= 24;
			} else {
				command.durationHours = null;
			}
		}
		touchProfile();
	}

	function setActionDomain(action: ServerProfileAction, value: string): void {
		if (editorDisabled) return
		action.actionDomain = value === "server" ? "server" : "player";

		if (action.actionDomain === "server") {
			action.commands = action.commands.map((command, index) => ({
				...command,
				commandType: "server_message",
				durationHours: null,
				offenseType: null,
				sortOrder: index,
			}));
		}

		touchProfile();
	}

	function setDuration(command: ServerProfileCommand, value: number): void {
		if (editorDisabled) return
		command.durationHours = Math.max(1, Math.min(200, value));
		touchProfile();
	}

	function setMaxDuration(command: ServerProfileCommand): void {
		if (editorDisabled) return
		command.durationHours = 999999;
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
		if (menuOwner && $infinityMenuState?.owner === menuOwner) closeInfinityMenu()
		menuOwner = null
		menuTarget = null
	}

	function actionMenu(event: MouseEvent, action: ServerProfileAction): void {
		menuOwner = event.currentTarget as HTMLElement
		menuTarget = action
		openProfileEditorMenu(event, action.label, {
			editable: !editorDisabled, canDelete: true,
			onDuplicate: () => {
				const index = profile?.actions.indexOf(action) ?? -1
				if (!profile || editorDisabled || index < 0) return
				profile = { ...profile, actions: duplicateAction(profile.actions, index) }
			},
			onDelete: () => {
				const index = profile?.actions.indexOf(action) ?? -1
				if (index >= 0) removeAction(index)
			}
		})
	}

	function commandMenu(event: MouseEvent, action: ServerProfileAction, command: ServerProfileCommand): void {
		menuOwner = event.currentTarget as HTMLElement
		menuTarget = command
		openProfileEditorMenu(event, labelCommandType(command.commandType), {
			editable: !editorDisabled, canDelete: action.commands.length > 1,
			onDuplicate: () => {
				const index = action.commands.indexOf(command)
				if (editorDisabled || !profile?.actions.includes(action) || index < 0) return
				action.commands = duplicateCommand(action.commands, index)
				touchProfile()
			},
			onDelete: () => {
				const index = action.commands.indexOf(command)
				if (profile?.actions.includes(action) && index >= 0) removeCommand(action, index)
			}
		})
	}

	function defaultAction(
		label: string,
		type: ServerProfileCommandType,
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
			commands: [defaultCommand(type, 0)],
		};
	}

	function commandTypesForAction(
		action: ServerProfileAction,
	): ServerProfileCommandType[] {
		return action.actionDomain === "server" ? ["server_message"] : commandTypes;
	}

	function defaultCommand(
		type: ServerProfileCommandType,
		sortOrder: number,
	): ServerProfileCommand {
		return {
			commandType: type,
			sortOrder,
			delayMs: 15,
			durationHours: type === "kick" || type === "ban" ? 24 : null,
			message:
				type === "server_message" ?
					"Please follow server rules."
				:	"[user], please follow server rules.",
			offenseType: type === "server_message" || type === `unban` ? null : "other",
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
		return value.replace("_", " ");
	}

	function labelActionDomain(value: ServerProfileActionDomain): string {
		return value === "server" ? "Server action" : "Player action";
	}

	function getError(errorValue: unknown, fallback: string): string {
		return errorValue instanceof Error ? errorValue.message : fallback;
	}

	function isUnavailable(errorValue: unknown): boolean {
		return errorValue instanceof ApiResultError && (errorValue.status === 403 || errorValue.status === 404)
	}
</script>

<section {hidden} class="panel-view profiles-view" aria-label="Profiles">
	<PanelHeader
		title={panelTitle}
		eyebrow={view === `overview` ? `Admin` : profileSubtitle}
		leadingIcon={view === "overview" ? null : "fa-arrow-left"}
		leadingLabel="Back"
		leadingDisabled={saving}
		onLeading={view === "overview" ? null : back}
	>
		<svelte:fragment slot="trailing">
			{#if view !== "overview"}
				<Button
					label="Cancel"
					disabled={saving}
					onClick={() => void cancelProfile()}
				/>
				<Button
					label="Save"
					variant="primary"
					disabled={saving || !profile || !canEditProfile}
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

	<div
		class="profiles-view__body"
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
					<button
						class="profile-summary"
						type="button"
						on:click={() => void openProfile(summary.profile.id)}
					>
						<strong>{summary.profile.name}</strong>
						<small
							>{summary.serverCount} servers / {summary.enabledActionCount}/{summary.actionCount}
							actions / {summary.commandCount} commands</small
						>
						{#if summary.profile.isDefault}<span>Default</span>{/if}
					</button>
				{:else}
					<EmptyState
						title="No profiles"
						message="Refresh to create the default profile."
					/>
				{/each}
			</div>
		{:else if view === "profile" && profile}
			<div class="profile-screen grid-stack gap-125">
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
							{#if !profile.profile.isDefault && mode !== "creating"}
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
					{#if mode === "editing" && !profile.profile.isDefault}
						<Select
							label="Transfer profile"
							options={transferOwnerSelectOptions}
							value={transferOwnerKey}
							disabled={saving || !canTransferProfile}
							onChange={(value) => (transferOwnerKey = value)}
						/>
					{/if}
				</section>

				<section class="profile-card grid-stack gap-125">
					<div class="profile-card-header">
						<h2>Servers</h2>
						<small>{profile.servers.length} assigned</small>
					</div>
					{#if profile.profile.owner.type === `team`}
						<small>Only one team can claim a server. Is your server claimed by someone else? <a href="https://chivalry2.dev/discord" on:click|preventDefault={() => void window.chivAuth.openHelp()}>Create a discord ticket</a></small>
					{/if}
					{#if gameServers.length > 0}
						<MultiSelect
							label="Assigned servers"
							options={serverOptions}
							value={selectedServerValues}
							disabled={editorDisabled || profile.profile.isDefault}
							onChange={setSelectedServers}
						/>
					{:else}
						<small>No game servers have been collected yet.</small>
					{/if}
				</section>

				<section class="profile-card grid-stack gap-125">
					<div class="profile-card-header">
						<h2>Actions</h2>
						<Button
							label="Add action"
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
							class:profile-row-button--selected={menuTarget === action && $infinityMenuState?.owner === menuOwner}
							class:profile-row-button--dragging={draggedActionIndex ===
								actionIndex}
							type="button"
							draggable={!editorDisabled}
							on:contextmenu={(event) => actionMenu(event, action)}
							on:dragstart={(event) => dragActionStart(event, actionIndex)}
							on:dragover={dragActionOver}
							on:drop={() => dropAction(actionIndex)}
							on:dragend={endActionDrag}
							on:click={() => openAction(actionIndex)}
						>
							<span class="drag-handle" aria-hidden="true"
								><i class="fa-solid fa-grip-vertical"></i></span
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
									.length} command{action.commands.length === 1 ? "" : "s"} / {(
									action.isEnabled
								) ?
									"enabled"
								:	"disabled"}</small
							>
						</button>
					{:else}
						<EmptyState title="No actions" message="Add an action or use Restore to copy actions from another profile." />
					{/each}
				</section>
			</div>
		{:else if view === "action" && profile && selectedAction && selectedActionIndex !== null}
			<div class="profile-screen grid-stack gap-125">
				<fieldset class="profile-card grid-stack gap-125" disabled={editorDisabled}>
					<div class="profile-card-header">
						<h2>Action</h2>
						<div class="grid-cluster gap-05">
							<Button label="Up" size="sm" disabled={selectedActionIndex === 0} onClick={() => moveSelectedAction(-1)} />
							<Button label="Down" size="sm" disabled={selectedActionIndex === profile.actions.length - 1} onClick={() => moveSelectedAction(1)} />
							<Button label="Remove" size="sm" variant="danger" onClick={removeSelectedAction} />
						</div>
					</div>
					<Select
						label="Action domain"
						options={actionDomainOptions}
						value={selectedAction.actionDomain}
						onChange={(value) => setActionDomain(selectedAction, value)}
					/>
					<Input label="Name" value={selectedAction.label} maxlength={255} onChange={setActionLabel} />
					<Input label="Description" value={selectedAction.description ?? ""} maxlength={255} onChange={setActionDescription} />
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
						<Select label="Icon" options={iconOptions} value={selectedAction.iconKey} onChange={setActionIcon} />
					</div>
					<Checkbox checked={selectedAction.isEnabled} label="Enabled" onChange={setActionEnabled} />
					<Checkbox
						checked={selectedAction.blockOnMissingVariables}
						label="Block action if server variables are missing"
						onChange={setActionVariableGuard}
					/>
				</fieldset>

				<section class="profile-card grid-stack gap-125">
					<div class="profile-card-header">
						<h2>Commands</h2>
						<Button
							label="Add command"
							icon="fa-plus"
							size="sm"
							disabled={editorDisabled}
							onClick={() => addCommand(selectedAction)}
						/>
					</div>
					{#each selectedAction.commands as command, commandIndex (command)}
						<button
							class="profile-row-button"
							class:profile-row-button--selected={menuTarget === command && $infinityMenuState?.owner === menuOwner}
							class:profile-row-button--dragging={draggedCommandIndex ===
								commandIndex}
							type="button"
							draggable={!editorDisabled}
							on:contextmenu={(event) => commandMenu(event, selectedAction, command)}
							on:dragstart={(event) => dragCommandStart(event, commandIndex)}
							on:dragover={dragCommandOver}
							on:drop={() => dropCommand(commandIndex)}
							on:dragend={endCommandDrag}
							on:click={() => openCommand(commandIndex)}
						>
							<span class="drag-handle" aria-hidden="true"
								><i class="fa-solid fa-grip-vertical"></i></span
							>
							<strong>{labelCommandType(command.commandType)}</strong>
							<small
								>+{command.delayMs}ms / {command.durationHours === 999999 ?
									"MAX"
								:	(command.durationHours ?? "no time")}</small
							>
						</button>
					{/each}
				</section>
			</div>
		{:else if view === "command" && selectedAction && selectedCommand && selectedCommandIndex !== null}
			<fieldset class="profile-screen grid-stack gap-125" disabled={editorDisabled}>
				<section class="profile-card grid-stack gap-125">
					<div class="profile-card-header">
						<h2>Command</h2>
						<div class="grid-cluster gap-05">
							<Button label="Up" size="sm" disabled={selectedCommandIndex === 0} onClick={() => moveSelectedCommand(-1)} />
							<Button label="Down" size="sm" disabled={selectedCommandIndex === selectedAction.commands.length - 1} onClick={() => moveSelectedCommand(1)} />
							<Button label="Remove" size="sm" variant="danger" disabled={selectedAction.commands.length <= 1} onClick={removeSelectedCommand} />
						</div>
					</div>
					<Select
						label="Type"
						options={commandTypeOptions}
						value={selectedCommand.commandType}
						onChange={(value) => setCommandType(selectedCommand, value)}
					/>
					<Textarea
						bind:element={commandMessageInput}
						label="Message"
						value={selectedCommand.message}
						maxlength={180}
						rows={4}
						hint={`${selectedCommand.message.length}/180 characters`}
						onChange={setCommandMessage}
					/>
					<Input
						label="Delay since last command (ms)"
						type="number"
						value={selectedCommand.delayMs}
						min={15}
						step={15}
						onChange={setCommandDelay}
					/>
					{#if selectedCommand.commandType === "kick" || selectedCommand.commandType === "ban"}
						<Range
							label="Time hours"
							min={1}
							max={200}
							value={Math.min(selectedCommand.durationHours ?? 24, 200)}
							formatValue={() => selectedCommand.durationHours === 999999 ? "MAX" : `${selectedCommand.durationHours ?? 24}`}
							onChange={(value) => setDuration(selectedCommand, value)}
						/>
						<Button label="MAX" size="sm" onClick={() => setMaxDuration(selectedCommand)} />
					{/if}
					{#if selectedCommand.commandType !== "server_message" && selectedCommand.commandType !== `unban`}
						<Select
							label="Offense type"
							options={offenseTypeOptions}
							value={selectedCommand.offenseType ?? "other"}
							onChange={setCommandOffenseType}
						/>
					{/if}
					<small>Variables are managed <a href="#servers" on:click|preventDefault={onOpenYourServers}>Per server</a>.</small>
					<VariableTagPicker
						tags={commandMessageTags}
						onSelect={insertSelectedCommandTag}
					/>
				</section>
			</fieldset>
		{/if}
	</div>
</section>

{#if sourceModal}
	<ProfileSourceModal mode={sourceModal.mode} owner={sourceModal.owner} owners={ownerOptions}
		onSelect={applyProfileSource} onCancel={() => sourceModal = null} />
{/if}

<style lang="scss">
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

	.profile-summary,
	.profile-card,
	.profile-row-button {
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		background: rgba(3, 12, 18, 0.28);
	}

	.profile-summary,
	.profile-row-button {
		display: grid;
		gap: 6px;
		padding: 12px;
		text-align: left;
	}

	.profile-row-button {
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		cursor: grab;
	}

	.profile-row-button--action {
		grid-template-columns: auto auto minmax(0, 1fr);
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

	.drag-handle {
		grid-row: span 2;
		width: 28px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		color: var(--color-text-secondary);
		background: transparent;
	}

	.profile-summary strong,
	.profile-row-button strong,
	.profile-card h2 {
		color: var(--color-light-primary);
	}

	.profile-summary small,
	.profile-summary span,
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

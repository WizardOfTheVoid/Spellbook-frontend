import { writable } from 'svelte/store';
import {
  extractEnvelope,
  getCoreErrorMessage,
  type CoreCallResult,
  type ProfileOwner,
  type ProfileOwnerOption,
  type TeamRecord,
  type UserSession
} from '$lib/core';
import { unwrap } from '$lib/utils/apiResult';
import { loadSettings } from '$lib/settings/settings-store';
import {
  initialStartupState,
  reduceStartup,
  type StartupEvent,
  type StartupState,
} from './startupState';

export type AbilityAction = 'read' | 'create' | 'edit' | 'delete' | 'admin';
export type UserRole = 'superadmin'
export type AuthState = { loading: boolean; user: UserSession | null };

class UserAbility {
  private user: UserSession | null = null;
  private readonly teamPermissions = new Map<number, Set<string>>();

  setUser(user: UserSession | null): void {
    this.user = user?.isActive ? user : null
    this.teamPermissions.clear();
  }

  setTeams(teams: readonly TeamRecord[]): void {
    this.teamPermissions.clear();
    for (const team of teams) this.teamPermissions.set(team.id, new Set(team.permissions));
  }

  setOwners(owners: readonly ProfileOwnerOption[]): void {
    this.teamPermissions.clear();
    for (const owner of owners) {
      if (owner.type === 'team') this.teamPermissions.set(owner.id, new Set(owner.permissions));
    }
  }

  isLoggedIn(): boolean {
    return this.user !== null;
  }

  is(role: UserRole): boolean {
    return role === 'superadmin' && this.user?.isSuperadmin === true
  }

  can(_action: AbilityAction, owner: ProfileOwner): boolean {
    if (this.user?.isSuperadmin || owner.type === 'user' && owner.id === this.user?.id) return true;
    const permissions = owner.type === 'team' ? this.teamPermissions.get(owner.id) : null;
    return Boolean(permissions?.has('admin') || permissions?.has(_action));
  }
}

const ability = new UserAbility()

export const User = {
  Ability: ability,
  is: (role: UserRole) => ability.is(role)
}
export const authState = writable<AuthState>({ loading: true, user: null });
export const startupState = writable<StartupState>(initialStartupState)
let authRevision = 0

export function needsPlayfabId(user: UserSession | null): boolean {
  return Boolean(user && !user.playfabId?.trim())
}

export async function loadSession(): Promise<void> {
  const revision = ++authRevision
  transitionStartup({ type: 'restore-started' })
  authState.update(state => ({ ...state, loading: true }))
  let result: CoreCallResult | null = null
  try {
    result = await window.chivAuth.session()
    if (revision !== authRevision) return
    setSession(await unwrap<UserSession>(result, 'Session request failed.'));
  } catch (error) {
    if (revision === authRevision) {
      setSession(
        null,
        error instanceof Error ? error.message : 'Session request failed.',
        authErrorCode(result)
      )
    }
  }
}

export async function loginWithDiscord(): Promise<void> {
  await unwrap<unknown>(await window.chivAuth.login(), 'Discord login failed.');
}

export async function completeOnboarding(displayName: string, playfabId: string): Promise<void> {
  const revision = ++authRevision
  const result = await window.chivAuth.updateProfile({ displayName, playfabId })
  if (revision !== authRevision) return
  setSession(await unwrap<UserSession>(
    result,
    'Profile setup failed.'
  ));
}

export async function logout(): Promise<void> {
  const revision = ++authRevision
  let result: Awaited<ReturnType<typeof window.chivAuth.logout>> | null = null
  let failure: unknown = null
  try {
    result = await window.chivAuth.logout()
    if (result.status !== 401) await unwrap<unknown>(result, `Logout failed.`)
  } catch (error) {
    failure = error
  }

  if (revision !== authRevision || result?.status === 409) return
  setSession(null)
  if (failure) throw failure
}

export function listenForSessionChanges(): () => void {
  return window.chivAuth.onSessionChange(async (result) => {
    const revision = ++authRevision
    try {
      const user = await unwrap<UserSession>(result, 'Discord login failed.')
      if (revision === authRevision) setSession(user);
    } catch {
      if (revision === authRevision) {
        setSession(null, getCoreErrorMessage(result, `Discord login failed.`), authErrorCode(result))
      }
    }
  });
}

function setSession(
  user: UserSession | null,
  startupError: string | null = null,
  startupErrorCode: string | null = null
): void {
  User.Ability.setUser(user);
  authState.set({ loading: false, user });
  transitionStartup(user
    ? { type: 'authenticated' }
    : startupError
      ? { type: 'restore-failed', message: startupError, code: startupErrorCode }
      : { type: 'signed-out' })
  if (user?.isActive && user.onboardingComplete) void loadSettings()
}

function authErrorCode(result: CoreCallResult | null): string | null {
  const code = extractEnvelope<unknown>(result)?.error?.code ?? result?.error?.code
  return typeof code === `string` && code.trim() ? code : null
}

function transitionStartup(event: StartupEvent): void {
  startupState.update(state => reduceStartup(state, event))
}

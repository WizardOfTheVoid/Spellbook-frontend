export type StartupPhase = 'starting' | 'restoring-session' | 'authenticated' | 'signed-out'

export type StartupState = Readonly<{
	phase: StartupPhase
	error: string | null
	errorCode: string | null
}>

export type StartupEvent =
	| Readonly<{ type: 'restore-started' }>
	| Readonly<{ type: 'authenticated' }>
	| Readonly<{ type: 'signed-out' }>
	| Readonly<{ type: 'restore-failed', message: string, code?: string | null }>

export const initialStartupState: StartupState = Object.freeze({
	phase: 'starting',
	error: null,
	errorCode: null,
})

export function reduceStartup(_state: StartupState, event: StartupEvent): StartupState {
	if (event.type === 'restore-started') return { phase: 'restoring-session', error: null, errorCode: null }
	if (event.type === 'authenticated') return { phase: 'authenticated', error: null, errorCode: null }
	if (event.type === 'restore-failed') {
		return { phase: 'signed-out', error: event.message, errorCode: event.code ?? null }
	}
	return { phase: 'signed-out', error: null, errorCode: null }
}

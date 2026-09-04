import {
	DEFAULT_NOTIFICATION_DURATION_MS,
	type NotificationLevel,
	type NotificationOptions,
	type NotificationRequest,
} from "./notificationTypes";

const NOTIFICATION_EVENT = "chiv:notification";
const NOTIFICATION_CLEAR_EVENT = "chiv:notification-clear";

export class NotificationEventBus {
	private readonly target = new EventTarget();

	emit(request: NotificationRequest): void {
		if (!request.message.trim()) {
			return;
		}

		this.target.dispatchEvent(
			new CustomEvent<NotificationRequest>(NOTIFICATION_EVENT, {
				detail: {
					...request,
					durationMs: request.durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS,
				},
			}),
		);
	}

	clear(): void {
		this.target.dispatchEvent(new Event(NOTIFICATION_CLEAR_EVENT));
	}

	listen(
		listener: (request: NotificationRequest) => void,
		onClear: () => void = () => {},
	): () => void {
		const handler = (event: Event) => {
			listener((event as CustomEvent<NotificationRequest>).detail);
		};

		this.target.addEventListener(NOTIFICATION_EVENT, handler);
		this.target.addEventListener(NOTIFICATION_CLEAR_EVENT, onClear);

		return () => {
			this.target.removeEventListener(NOTIFICATION_EVENT, handler);
			this.target.removeEventListener(NOTIFICATION_CLEAR_EVENT, onClear);
		};
	}
}

export const notificationEvents = new NotificationEventBus();

export function notify(request: NotificationRequest): void {
	notificationEvents.emit(request);
}

export function notifySuccess(message: string, options: NotificationOptions = {}): void {
	notifyLevel("success", message, options);
}

export function notifyError(message: string, options: NotificationOptions = {}): void {
	notifyLevel("error", message, options);
}

export function notifyWarning(message: string, options: NotificationOptions = {}): void {
	notifyLevel("warning", message, options);
}

export function notifyInfo(message: string, options: NotificationOptions = {}): void {
	notifyLevel("info", message, options);
}

function notifyLevel(
	level: NotificationLevel,
	message: string,
	options: NotificationOptions,
): void {
	notify({
		message,
		level,
		durationMs: options.durationMs,
		dedupeKey: options.dedupeKey,
		icon: options.icon,
		iconType: options.iconType,
		action: options.action,
	});
}

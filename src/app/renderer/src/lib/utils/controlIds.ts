let nextControlId = 0;

export function createControlId(prefix: string): string {
	nextControlId += 1;
	return `${prefix}-${nextControlId}`;
}
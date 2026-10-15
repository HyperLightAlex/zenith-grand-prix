/** Cosmetic only: retain the exact code-built roster as a comparison. */
export type RosterModel = 'updated' | 'current';
let model: RosterModel = 'updated';
export const getRosterModel = (): RosterModel => model;
export function setRosterModel(value: RosterModel): void { model = value; }
export function toggleRosterModel(): void { model = model === 'updated' ? 'current' : 'updated'; }
export const rosterLabel = (): string => model === 'updated' ? 'Updated designs' : 'Original designs';

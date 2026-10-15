/** Presentation-only comparison; it never changes simulation rules or stats. */
export const SUNHAWK_MODELS = ['updated', 'current', 'game'] as const;
export type SunhawkModel = (typeof SUNHAWK_MODELS)[number];
export type SunhawkAssetVariant = Exclude<SunhawkModel, 'game'>;
export const SUNHAWK_LABELS: Record<SunhawkModel, string> = {
  updated: 'Updated design', current: 'Current reference', game: 'Previous game model',
};
let model: SunhawkModel = 'updated';
let panels = false;

export function isSunhawkModel(value: unknown): value is SunhawkModel {
  return SUNHAWK_MODELS.includes(value as SunhawkModel);
}
export const getSunhawkModel = (): SunhawkModel => model;
export const getSunhawkPanels = (): boolean => panels;
export function setSunhawkModel(value: SunhawkModel): void { model = value; }
export function setSunhawkPanels(value: boolean): void { panels = value; }
export function cycleSunhawkModel(dir = 1): SunhawkModel {
  model = SUNHAWK_MODELS[(SUNHAWK_MODELS.indexOf(model) + dir + SUNHAWK_MODELS.length) % SUNHAWK_MODELS.length];
  return model;
}

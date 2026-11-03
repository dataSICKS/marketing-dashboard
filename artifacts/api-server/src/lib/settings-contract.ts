/** Keep external collectors compatible while adCodes is the canonical key.
 * The legacy key is a mirror, never a second independently editable setting. */
export function storedSettings(settings: { adCodes: string[] }) {
  return { adCodes: settings.adCodes, clarityTargetUrls: [...settings.adCodes] };
}

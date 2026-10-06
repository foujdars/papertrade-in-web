/** Directional colours shared by canvas charts and DOM controls in every theme. */
export const MARKET_GREEN = '#00a67e';
export const MARKET_RED = '#f04458';
const rgb = (colour: string) => [1, 3, 5].map(start => parseInt(colour.slice(start, start + 2), 16)).join(',');
const MARKET_RGB = { green: rgb(MARKET_GREEN), red: rgb(MARKET_RED) };
export const marketTint = (side: keyof typeof MARKET_RGB, opacity: number) => `rgba(${MARKET_RGB[side]},${opacity})`;

/** Upgrade the old app defaults without replacing a user's other custom colours. */
export const normalizeMarketColour = (colour: string) => {
  const legacy = colour.toLowerCase();
  return legacy === '#12a58a' ? MARKET_GREEN : legacy === '#ec5475' ? MARKET_RED : colour;
};

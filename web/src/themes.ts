// The accent themes of the app: the modes of the `Theme` collection in Figma,
// in lowercase. The first one applies when a member has chosen none.
//
// This list exists in three places that must agree: here, the blocks of
// styles/tokens.css, and the API, which refuses any other value of
// member.accentTheme.
export const accentThemes = [
  'brass',
  'tangerine',
  'raspberry',
  'orchid',
  'cornflower',
  'azure',
  'lagoon',
  'emerald',
  'lime',
  'ivory',
] as const;

export type AccentTheme = (typeof accentThemes)[number];

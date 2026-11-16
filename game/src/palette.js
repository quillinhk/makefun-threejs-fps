// The look plan, in one place. Dusk in an industrial yard: cold blue-grey steel against a
// warm amber sun and rust. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#2a2e38', // dusk sky / background
  surface: '#3a3f4a', // concrete
  hairline: '#4a515e', // steel
  ink: '#ece5d8', // warm off-white
  muted: '#8b93a1', // cool grey
  accent: '#f0a830', // amber sun
  rust: '#b4552d', // rusted metal
  hazard: '#e8c33a', // hazard yellow
  furnace: '#ff7a2f', // furnace glow
};

export function shade(name) {
  return PALETTE[name];
}

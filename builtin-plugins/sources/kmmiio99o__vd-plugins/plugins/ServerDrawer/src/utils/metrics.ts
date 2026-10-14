import { Dimensions } from "react-native";

// Tile size for the drawer's grid. Sized so a whole number of tiles fills the width with a small
// margin on each side (a fixed 48px tile left an uneven gap on the left and looked oversized).
const TARGET = 40;
export const GAP = 6;
export const PAD = 10;

const width = Dimensions.get("window").width;
const columns = Math.max(4, Math.floor((width - PAD * 2 + GAP) / (TARGET + GAP)));

export const ICON = Math.floor((width - PAD * 2 - (columns - 1) * GAP) / columns);
export const RADIUS = Math.round(ICON / 3);
/** Server icons inside a folder tile. */
export const MINI = Math.round(ICON / 3);
export const TOP_PAD = 11;

/**
 * The colours somebody can pick from in the studio, in spectrum order.
 *
 * Fifty-six of them: the design team's approved sheet, and the twelve the Hub
 * already ships as the meaning of a status or a diary kind. Both, deliberately
 * — a list that left out the colours currently on screen would make "put it
 * back to what it was" a thing somebody had to do by typing a hex code they
 * would first have to go and find.
 *
 * Held as data rather than sorted at runtime. Spectrum order is a decision
 * about how the list reads, and a list somebody can see the order of is a list
 * they can correct; a comparator that computes hue is neither. The order is
 * red through to pink the long way round, with the five colours that have
 * almost no hue at the end, because a grey sorted by hue lands somewhere
 * arbitrary and looks like a mistake.
 *
 * Naming them is the point of the exercise. `#8e3b74` tells nobody anything,
 * so the dropdown says Mulberry and the hex field is still there underneath
 * for anybody who has a code in their hand.
 */

export interface PaletteColour {
  name: string;
  hex: string;
}

export const PALETTE: PaletteColour[] = [
  { name: "Pillar box", hex: "#d50101" },
  { name: "Blush white", hex: "#f6eaea" },
  { name: "Salmon", hex: "#e67d73" },
  { name: "Brick", hex: "#b8341f" },
  { name: "Terracotta", hex: "#cc6850" },
  { name: "Coral", hex: "#fa6b40" },
  { name: "Vermilion", hex: "#f4511e" },
  { name: "Cocoa", hex: "#795648" },
  { name: "Shell", hex: "#f9f0eb" },
  { name: "Burnt orange", hex: "#a94c16" },
  { name: "Tangerine", hex: "#ef6c02" },
  { name: "Oat", hex: "#f7f2ec" },
  { name: "Fawn", hex: "#a68550" },
  { name: "Marigold", hex: "#f09400" },
  { name: "Bronze", hex: "#9c6b16" },
  { name: "Umber", hex: "#875d13" },
  { name: "Saffron", hex: "#f7bf27" },
  { name: "Mustard", hex: "#e4c442" },
  { name: "Primrose", hex: "#fcfdcb" },
  { name: "Chartreuse", hex: "#c0ca33" },
  { name: "Apple", hex: "#7cb342" },
  { name: "Moss", hex: "#508a4d" },
  { name: "Mint white", hex: "#f2f9f4" },
  { name: "Forest", hex: "#0b8043" },
  { name: "Pine", hex: "#256b48" },
  { name: "Jade", hex: "#34b779" },
  { name: "Seafoam", hex: "#bae8da" },
  { name: "Viridian", hex: "#009688" },
  { name: "Deep teal", hex: "#17706c" },
  { name: "Ice", hex: "#ebf7f7" },
  { name: "Lagoon", hex: "#308d9a" },
  { name: "Azure", hex: "#049be5" },
  { name: "Denim", hex: "#2f5f9e" },
  { name: "Cornflower", hex: "#4286f5" },
  { name: "Mist", hex: "#eef1f6" },
  { name: "Powder", hex: "#ebf1ff" },
  { name: "Cobalt", hex: "#4868b3" },
  { name: "Electric blue", hex: "#2260ff" },
  { name: "House navy", hex: "#4c5578" },
  { name: "Sapphire", hex: "#3f52b5" },
  { name: "Periwinkle", hex: "#7a86cb" },
  { name: "Iris", hex: "#6b4fc0" },
  { name: "Wisteria", hex: "#b49ddb" },
  { name: "Lilac", hex: "#9f6aaf" },
  { name: "Grape", hex: "#8e24aa" },
  { name: "Mulberry", hex: "#8e3b74" },
  { name: "Raspberry", hex: "#ad1357" },
  { name: "Cerise", hex: "#d91a60" },
  { name: "Plum", hex: "#a33a60" },
  { name: "Rose", hex: "#f4a7c1" },
  { name: "Rosewood", hex: "#b14d59" },
  { name: "Bark", hex: "#4e423c" },
  { name: "Charcoal", hex: "#616161" },
  { name: "Slate", hex: "#6e7e8b" },
  { name: "Stone", hex: "#8b8b91" },
  { name: "Clay", hex: "#a79c8f" },
];

/**
 * What the palette calls a colour, where it has a name for it.
 *
 * Case-insensitive because a hex code typed by hand arrives in whatever case
 * somebody typed it, and `#D50101` is the same colour as `#d50101`. Anything
 * the palette does not hold answers with nothing, which is what lets the
 * dropdown say the value is a custom one rather than silently showing the
 * first entry as though it had been chosen.
 */
export function paletteName(hex: string): string | undefined {
  const wanted = (hex ?? "").trim().toLowerCase();
  return PALETTE.find((c) => c.hex === wanted)?.name;
}

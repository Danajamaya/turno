// Theme comes only from the design tokens (replica/design). Run `pnpm tokens`
// at the repo root after changing tokens.json.
const roles = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [`bg-role-${n}`, `text-role-${n}-text`, `border-role-${n}-text`]);
const channels = ["guruwalk", "freetour", "strawberry", "getyourguide", "viator", "civitatis", "turno"].flatMap((c) => [`bg-ch-${c}`, `border-l-ch-${c}`, `border-t-ch-${c}`]);

module.exports = {
  presets: [require("./tailwind.preset.js")],
  content: ["./src/**/*.{ts,tsx}"],
  safelist: [...roles, ...channels], // shift colours are picked per person at runtime
};

import colors from "tailwindcss/colors"

export const allColors = {
  slate: colors.slate,
  gray: colors.gray,
  zinc: colors.zinc,
  neutral: colors.neutral,
  stone: colors.stone,
  red: colors.red,
  orange: colors.orange,
  amber: colors.amber,
  yellow: colors.yellow,
  lime: colors.lime,
  green: colors.green,
  emerald: colors.emerald,
  teal: colors.teal,
  cyan: colors.cyan,
  sky: colors.sky,
  blue: colors.blue,
  indigo: colors.indigo,
  violet: colors.violet,
  purple: colors.purple,
  fuchsia: colors.fuchsia,
  pink: colors.pink,
  rose: colors.rose,
}

// Maintains types
export function getColors(key: string | undefined) {
  switch (key) {
    case "slate":
      return allColors["slate"]
    case "gray":
      return allColors["gray"]
    case "zinc":
      return allColors["zinc"]
    case "neutral":
      return allColors["neutral"]
    case "stone":
      return allColors["stone"]
    case "red":
      return allColors["red"]
    case "orange":
      return allColors["orange"]
    case "amber":
      return allColors["amber"]
    case "yellow":
      return allColors["yellow"]
    case "lime":
      return allColors["lime"]
    case "green":
      return allColors["green"]
    case "emerald":
      return allColors["emerald"]
    case "teal":
      return allColors["teal"]
    case "cyan":
      return allColors["cyan"]
    case "sky":
      return allColors["sky"]
    case "blue":
      return allColors["blue"]
    case "indigo":
      return allColors["indigo"]
    case "violet":
      return allColors["violet"]
    case "purple":
      return allColors["purple"]
    case "fuchsia":
      return allColors["fuchsia"]
    case "pink":
      return allColors["pink"]
    case "rose":
      return allColors["rose"]
    default:
      return allColors["slate"]
  }
}

export default {
  allColors,
  getColors,
}

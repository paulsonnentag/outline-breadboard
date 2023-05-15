import colors from "tailwindcss/colors"

export function accentColors(setColor: string) {
  switch (setColor) {
    case "red":
      return [
        colors.red[100],
        colors.red[200],
        colors.red[400],
        colors.red[400],
        colors.red[500],
        colors.red[600],
      ]
    case "orange":
      return [
        colors.orange[100],
        colors.orange[200],
        colors.orange[400],
        colors.orange[400],
        colors.orange[500],
        colors.orange[600],
      ]
    case "yellow":
      return [
        colors.yellow[100],
        colors.yellow[200],
        colors.yellow[400],
        colors.yellow[400],
        colors.yellow[500],
        colors.yellow[600],
      ]
    case "green":
      return [
        colors.green[100],
        colors.green[200],
        colors.green[400],
        colors.green[400],
        colors.green[500],
        colors.green[600],
      ]
    case "blue":
      return [
        colors.blue[100],
        colors.blue[300],
        colors.blue[400],
        colors.blue[400],
        colors.blue[500],
        colors.blue[600],
      ]
    case "purple":
      return [
        colors.purple[100],
        colors.purple[200],
        colors.purple[400],
        colors.purple[400],
        colors.purple[500],
        colors.purple[600],
      ]
    case "pink":
      return [
        colors.pink[100],
        colors.pink[200],
        colors.pink[400],
        colors.pink[400],
        colors.pink[500],
        colors.pink[600],
      ]
    default:
      return defaultAccentColors
  }
}

export const defaultAccentColors = [
  colors.gray[200],
  colors.gray[300],
  colors.gray[400],
  colors.purple[400],
  colors.purple[500],
  colors.purple[600],
]

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
  accentColors,
  defaultAccentColors,
  allColors,
  getColors,
}

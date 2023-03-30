import colors from "tailwindcss/colors"

export function accentColors(setColor: string) {
  switch (setColor) {
    case "red": 
      return [
        colors.red[100],
        colors.red[200],
        colors.red[300],
        colors.red[400],
        colors.red[500],
        colors.red[600],
      ]
    case "orange": 
      return [
        colors.orange[100],
        colors.orange[200],
        colors.orange[300],
        colors.orange[400],
        colors.orange[500],
        colors.orange[600],
      ]
    case "yellow": 
      return [
        colors.yellow[100],
        colors.yellow[200],
        colors.yellow[300],
        colors.yellow[400],
        colors.yellow[500],
        colors.yellow[600],
      ]
    case "green": 
      return [
        colors.green[100],
        colors.green[200],
        colors.green[300],
        colors.green[400],
        colors.green[500],
        colors.green[600],
      ]
    case "blue": 
      return [
        colors.blue[100],
        colors.blue[200],
        colors.blue[300],
        colors.blue[400],
        colors.blue[500],
        colors.blue[600],
      ]
    case "purple": 
      return [
        colors.purple[100],
        colors.purple[200],
        colors.purple[300],
        colors.purple[400],
        colors.purple[500],
        colors.purple[600],
      ]
    case "pink": 
      return [
        colors.pink[100],
        colors.pink[200],
        colors.pink[300],
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

export default {
  accentColors,
  defaultAccentColors
}
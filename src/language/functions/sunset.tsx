import { FunctionDef, FunctionDefs } from "./function-def"
import { parseDate, parseLatLng } from "../../properties"
import SunCalc from "suncalc"
import { FunctionSuggestion, Parameter } from "../function-suggestions"

export const SUNSET_FN: FunctionDefs = {
  Sunset: getSolarFunctionDef("sunset"),
  Sunrise: getSolarFunctionDef("sunrise"),
}

function getSolarFunctionDef(property: "sunrise" | "sunset"): FunctionDef {
  const name = property === "sunrise" ? "Sunrise" : "Sunset"
  const emoji = property === "sunrise" ? "🌅" : "🌌"

  return {
    icon: "wb_twilight",
    summaryView: (value) => `${emoji} ${value}`,
    suggestions: (parameters: Parameter[]) => {
      const dates = parameters.filter((p) => p.value.type === "date")
      const locations = parameters.filter((p) => p.value.type === "location")

      const suggestions: FunctionSuggestion[] = []

      for (const date of dates) {
        for (const location of locations) {
          let rank = location.distance + date.distance

          suggestions.push({
            icon: "wb_twilight",
            name,
            arguments: [
              {
                label: "in",
                value: location.value.expression,
              },
              {
                label: "on",
                value: date.value.expression,
              },
            ],
            rank,
          })
        }
      }

      return suggestions
    },
    autocomplete: {
      icon: "wb_twilight",
      name,
      arguments: [
        {
          label: "in",
        },
        {
          label: "on",
        },
      ],
    },
    function: async ([], namedArgs) => {
      if (namedArgs.on && namedArgs.in) {
        let onDate = namedArgs.on ? parseDate(namedArgs.on.id) : undefined
        let inLocation = namedArgs.in
          ? parseLatLng(await namedArgs.in.getPropertyAsync("position"))
          : undefined

        if (!onDate || !inLocation) {
          return undefined
        }

        const times = SunCalc.getTimes(onDate, 51.5, -0.1)
        const value: Date = times[property]

        return `${value.getHours().toString().padStart(2, "0")}:${value
          .getMinutes()
          .toString()
          .padStart(2, "0")}`
      }
    },
  }
}

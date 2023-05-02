import { FunctionDefs } from "./function-def"
import { parseDate, parseLatLng } from "../../properties"
import SunCalc from "suncalc"

// TODO: doesn't do tree traversal
export const SUNSET_FN: FunctionDefs = {
  Sunset: {
    icon: "wb_twilight",
    autocomplete: {
      label: "Sunset",
      value: "Sunset(in: $, on:)",
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

        return `${times.sunrise.getHours()}:${times.sunrise.getMinutes()}`
      }
    },
  },
}

import { WeatherInformation } from "../formulas"
import classNames from "classnames"

interface ComputedPropertyViewProps {
  props: { [name: string]: any }
}

export function ComputedPropertiesView({ props }: ComputedPropertyViewProps) {
  return (
    <div>
      {Object.entries(props).map(([name, value]) => {
        if (name === "weather") {
          return <WeatherInfoView value={value as WeatherInformation} />
        }

        return (
          <div>
            {name}: {JSON.stringify(value)}`
          </div>
        )
      })}
    </div>
  )
}

interface WeatherInfoViewProps {
  value: WeatherInformation
}

function WeatherInfoView({ value }: WeatherInfoViewProps) {
  const description = value.weatherCode
    ? getWeatherDescription(value.weatherCode).toLowerCase()
    : ""

  return (
    <div className="px-1 rounded border border-gray-300 bg-gray-100 w-fit flex gap-1">
      {false && value.weatherCode && (
        <div className="w-[24px]">
          <WeatherIconView code={value.weatherCode} />
        </div>
      )}
      <span className="text-gray-500">{description}</span>
      <span className="text-gray-300"> </span>
      <span className={value.min <= 0 ? "text-blue-500" : "text-gray-500"}>{value.min}</span>
      <span className="text-gray-300">•</span>
      <span className={value.max <= 0 ? "text-blue-500" : "text-gray-500"}>{value.max}</span>
    </div>
  )
}

function getWeatherDescription(code: number): string {
  switch (code) {
    case 0:
      return "Clear sky"
    case 1:
      return "Mainly clear"
    case 2:
      return "Partly cloudy"
    case 3:
      return "Overcast"
    case 45:
      return "Fog"
    case 48:
      return "Depositing rime fog"
    case 51:
      return "Light drizzle"
    case 53:
      return "Moderate drizzle"
    case 55:
      return "Dense drizzle"
    case 56:
      return "Light freezing drizzle"
    case 57:
      return "Intense freezing drizzle"
    case 61:
      return "Slight rain"
    case 63:
      return "Moderate rain"
    case 65:
      return "Heavy rain"
    case 66:
      return "Light freezing rain"
    case 67:
      return "Heavy freezing rain"
    case 71:
      return "Slight snow fall"
    case 73:
      return "Moderate snow fall"
    case 75:
      return "Heavy snow fall"
    case 77:
      return "Snow grains"
    case 80:
      return "Slight rain showers"
    case 81:
      return "Moderate rain showers"
    case 82:
      return "Violent rain showers"
    case 85:
      return "Slight snow showers"
    case 86:
      return "Heavy snow showers"
    case 95:
      return "Thunderstorm"
    case 96:
      return "Thunderstorm with slight hail"
    case 99:
      return "Thunderstorm with heavy hail"
    default:
      return ""
  }
}

interface WeatherIconProps {
  code: number
}

function WeatherIconView({ code }: WeatherIconProps) {
  switch (code) {
    case 0: // clear sky
    case 1: // mainly clear
      return <span className="material-icons">sunny</span>

    case 2: // partly cloudy
      return <span className="material-icons">partly_cloudy_day</span>

    case 3: // overcast
      return <span className="material-icons text-gray-300">cloudy</span>

    case 48: // depositing rime fog
    case 45: // fog
      return <span className="material-icons">foggy</span>

    case 80: // Slight rain showers"
    case 81: // Moderate rain showers"
    case 51: // light drizzle
    case 53: // moderate drizzle
    case 55: // dense drizzle
    case 56: // light freezing drizzle
    case 61: // Slight rain
    case 66: // Light freezing rain
      return <span className="material-icons">rainy</span>

    case 86: // Heavy snow showers
    case 71: // Slight snow fall
    case 73: // Moderate snow fall
    case 75: // Heavy snow fall
    case 77: // Snow grains
    case 85: // Slight snow showers
      return <span className="material-icons">weather_snowy</span>

    case 82: // Violent rain showers
    case 57: // Intense freezing drizzle
    case 63: // Moderate rain
    case 65: // Heavy rain
    case 67: // Heavy freezing rain
      return <span className="material-icons">rainy</span>

    case 95: // Thunderstorm
    case 96: // Thunderstorm with slight hail
    case 99: // Thunderstorm with heavy hail
      return <span className="material-icons">thunderstorm</span>

    default:
      return null
  }
}

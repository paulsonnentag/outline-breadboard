const IS_DEMO_MODE = true

export const SHOW_RELATIVE_DAY_NAMES = !IS_DEMO_MODE
export const ALWAYS_SHOW_WEEKDAY_NAMES = IS_DEMO_MODE
export const SHOW_CLOSE_BUTTON = true
export const IMAGE_HEIGHT = IS_DEMO_MODE ? "100PX" : "200px"
export const SHOW_FUNCTION_SUGGESTIONS = true
export const OVERRIDE_INFERRED_RELATIONSHIP = IS_DEMO_MODE

export const SHOW_MOCK_DATA_IN_CALENDAR = IS_DEMO_MODE

export const DEFAULT_PANEL_WIDTH = 400

export const FIXED_WIDTH_FIRST_PANEL_ENABLED = IS_DEMO_MODE
export const FIRST_PANEL_WIDTH = 700

export const USE_HARD_CODED_RESULTS = IS_DEMO_MODE

export const HARD_CODED_RESULT_SATURDAY = {
  min: 12,
  max: 19,
  //min: 16.5,
  // max: 29.6,
  mean: 18,
  weatherCode: 80,
  hourly: {
    "08:00": {
      temp: 16,
      precipitationProbability: 0,
      windspeed_10m: 16.2,
      windgusts_10m: 42.8,
    },
    "09:00": {
      temp: 17,
      precipitationProbability: 0,
      windspeed_10m: 16,
      windgusts_10m: 40.3,
    },
    "10:00": {
      temp: 17,
      precipitationProbability: 0,
      windspeed_10m: 14.9,
      windgusts_10m: 38.2,
    },
    "11:00": {
      weatherCode: 2,
      temp: 17,
      precipitationProbability: 10,
      windspeed_10m: 15,
      windgusts_10m: 35.6,
    },
    "12:00": {
      weatherCode: 3,
      temp: 18,
      precipitationProbability: 20,
      windspeed_10m: 16.6,
      windgusts_10m: 39.2,
    },
    "13:00": {
      weatherCode: 3,
      temp: 19,
      precipitationProbability: 23,
      windspeed_10m: 18.3,
      windgusts_10m: 42.5,
    },
    "14:00": {
      temp: 19,
      weatherCode: 3,
      precipitationProbability: 25,
      windspeed_10m: 19.4,
      windgusts_10m: 46.1,
    },
    "15:00": {
      weatherCode: 3,
      temp: 18,
      precipitationProbability: 30,
      windspeed_10m: 19.2,
      windgusts_10m: 47.9,
    },
    "16:00": {
      weatherCode: 80,
      temp: 18,
      precipitationProbability: 40,
      windspeed_10m: 19.3,
      windgusts_10m: 0,
    },
    "17:00": {
      weatherCode: 80,
      temp: 18,
      precipitationProbability: 39,
      windspeed_10m: 18.8,
      windgusts_10m: 0,
    },
    "18:00": {
      temp: 29.4,
      precipitationProbability: 27,
      windspeed_10m: 9.1,
      windgusts_10m: 23.8,
    },
    "19:00": {
      temp: 29,
      precipitationProbability: 28,
      windspeed_10m: 8.2,
      windgusts_10m: 21.6,
    },
    "20:00": {
      temp: 28.3,
      precipitationProbability: 29,
      windspeed_10m: 7.4,
      windgusts_10m: 19.4,
    },
    "21:00": {
      temp: 26.9,
      precipitationProbability: 30,
      windspeed_10m: 7.4,
      windgusts_10m: 19.4,
    },
    "22:00": {
      temp: 25.3,
      precipitationProbability: 31,
      windspeed_10m: 7.9,
      windgusts_10m: 19.4,
    },
    "23:00": {
      temp: 24,
      precipitationProbability: 32,
      windspeed_10m: 7.7,
      windgusts_10m: 19.4,
    },
  },
}

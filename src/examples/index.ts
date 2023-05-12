import seattle36Hours from "./seattle_36_hours.json"
import polesOfInconvenience from "./poles_of_inconvenience.json"
import functionOverview from "./function_overview.json"
import { GraphDoc } from "../graph"

export const EXAMPLES: GraphDoc[] = [
  functionOverview as GraphDoc,
  polesOfInconvenience as GraphDoc,
  seattle36Hours as GraphDoc,
]

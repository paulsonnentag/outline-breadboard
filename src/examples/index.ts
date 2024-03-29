import seattle36Hours from "./seattle_36_hours.json"
import polesOfInconvenience from "./poles_of_inconvenience.json"
import functionOverview from "./function_overview.json"
import friendsVisiting from "./friends_visiting.json"
import detailPlanPoi16 from "./detail_plan_poi_16.json"
import { GraphDoc } from "../graph"

export const EXAMPLES: GraphDoc[] = [
  friendsVisiting as GraphDoc,
  polesOfInconvenience as GraphDoc,
  seattle36Hours as GraphDoc,
  functionOverview as GraphDoc,
]

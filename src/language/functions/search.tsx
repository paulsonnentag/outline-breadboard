import React from "react"
import { FunctionDefs } from "./index"
import { placesServiceApi } from "../../google"
import { Scope } from "../scopes"
import { parseLatLng } from "../../properties"
import { createPlaceNode } from "../../views/MapNodeView"
import { RootOutlineEditor } from "../../Root"
import { ValueNode } from "../../graph"

export const SEARCHLOCATIONS_FN: FunctionDefs = {
  SearchLocations: {
    summaryView: ({ value }) => {
      return <SearchLocationsView value={value} />
    },
    autocomplete: {
      label: "Search locations",
      value: "{SearchLocations(for:$, near:)}",
    },
    function: async ([node], namedArgs, scope) => {
      const search = namedArgs.for
      let location = namedArgs.near
        ? parseLatLng(await namedArgs.near.getPropertyAsync("position"))
        : undefined
      
      if (location && search) {
        const placesNodes = await Promise.all((await getPlaceIdsAt(location.lat, location.lng, search)).map(async placeId => {
          return await createPlaceNode(placeId)
        }))
  
        scope.addComputationResult({
          name: "SearchLocations",
          data: placesNodes
        })

        return
      }
    },
  },
}

async function getPlaceIdsAt(lat: number, lng: number, search: string, bounds?: google.maps.LatLngBoundsLiteral): Promise<string[]> {
  const placesService = await placesServiceApi

  return new Promise((resolve) => {
    placesService.nearbySearch(
      bounds ?
        {
          bounds,
          keyword: search,
        } : {
          location: new google.maps.LatLng(lat, lng),
          radius: 20000,
          keyword: search,
        },
      (results) => {
        if (!results) {
          resolve([])
          return
        }

        resolve(results.flatMap((result) => result.place_id ? [result.place_id] : []))
      })
  })
}

interface SearchLocationsViewProps {
  value: any
}

export function SearchLocationsView({ value }: SearchLocationsViewProps) {
  let nodes = value as ValueNode[]

  // TODO: Only showing the first item; need to wrap them into a root item

  return (<>
    { nodes.length > 0 && (
      <RootOutlineEditor
        focusOffset={0}
        nodeId={nodes[0].id}
        index={0}
        path={[]}
        parentIds={[]}
        selectedPath={[]}
        onChangeSelectedPath={(newSelectedPath, newFocusOffset = 0) => {
          
        }}
        onOpenNodeInNewPane={ nodeId => {}}
        isHoveringOverId={undefined}
        setIsHoveringOverId={() => { }}
        disableCustomViews={true}
      />
    )}
  </>)
}
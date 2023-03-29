import { NodeViewProps } from "./index"
import { getNode, useGraph } from "../graph"
import { isString } from "../utils"
import classNames from "classnames"

export function TableNodeView({ node, isHoveringOverId, setIsHoveringOverId }: NodeViewProps) {
  const { graph } = useGraph()

  const nodeId = node.id
  const cols = node.view?.includes("asCol") ?? false

  let fields: {
    [key: string]: string
  } = {}
  let fieldIds: {
    [key: string]: string
  } = {}
  let hoveredFields: number[] = []
  let selectedFields: number[] = []

  for (let childId of node.children) {
    const child = getNode(graph, childId)
    const index = isString(child.value) ? child.value.indexOf(":") : -1

    if (index >= 0) {
      const value = child.value as string

      fields[value.substring(0, index)] = value.substring(index + 1)
      fieldIds[value.substring(0, index)] = child.id 

      if (isHoveringOverId == child.id) {
        hoveredFields.push(Object.keys(fields).length - 1)
      }
      else if (child.isSelected) {
        selectedFields.push(Object.keys(fields).length - 1)
      }
    }
  }

  let subtreesColumns: string[] = []
  let subtrees: {
    [row: string]: {
      [col: string]: string
    }
  } = {}
  let subtreesColumnIds: {
    [col: string]: string
  } = {}
  let hoveredSubtrees: number[] = []
  let selectedSubtrees: number[] = []

  for (let childId of node.children) {
    const child = getNode(graph, childId)

    if (isString(child.value) && !child.value.includes(":")) {
      for (let grandchildId of child.children) {
        const grandchild = getNode(graph, grandchildId)

        const index = isString(grandchild.value) ? grandchild.value.indexOf(":") : -1

        if (index >= 0) {
          const grandChildValue = grandchild.value as string

          if (!subtrees[grandChildValue.substring(0, index)]) {
            subtrees[grandChildValue.substring(0, index)] = {}
          }

          subtrees[grandChildValue.substring(0, index)][child.value] = grandChildValue.substring(
            index + 1
          )

          if (subtreesColumns.indexOf(child.value) === -1) {
            subtreesColumns.push(child.value)
            subtreesColumnIds[child.value] = child.id

            if (isHoveringOverId == child.id) {
              hoveredSubtrees.push(subtreesColumns.length - 1)
            }
            else if (child.isSelected) {
              selectedSubtrees.push(subtreesColumns.length - 1)
            }
          }
        }
      }
    }
  }

  return (
    <div className="text-sm">
      {Object.keys(fields).length > 0 && (
        <table className="table-auto border-collapse border border-slate-100 text-right mb-2">
          <tbody>
            {Object.keys(fields).map((key, index) => (
              <tr key={key} 
                className={classNames({"bg-slate-300": isHoveringOverId == fieldIds[key] /*hoveredFields.includes(index)*/, "bg-gray-100": selectedFields.includes(index)})} 
                onMouseEnter={() => setIsHoveringOverId(fieldIds[key])} 
                onMouseLeave={() => isHoveringOverId == fieldIds[key] && setIsHoveringOverId(undefined)}
              >
                <td className="border border-slate-200 p-2 font-bold">{key}</td>
                <td className="border border-slate-200 p-2">{fields[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {Object.keys(subtrees).length > 0 && (
        <table className="table-auto border-collapse border border-slate-100 text-right mb-2">
          <thead>
            <tr>
              <th></th>
              {subtreesColumns.map((col, index) => (
                <th key={index}
                  className={classNames("border border-slate-200 p-2 font-bold", {"bg-gray-200": hoveredSubtrees.includes(index), "bg-gray-100": selectedSubtrees.includes(index)})}
                  onMouseEnter={() => setIsHoveringOverId(subtreesColumnIds[col])} 
                  onMouseLeave={() => isHoveringOverId == subtreesColumnIds[col] && setIsHoveringOverId(undefined)}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(subtrees).map((row, index) => (
              <tr key={index}>
                <td className="border border-slate-200 p-2 font-bold">{row}</td>
                {subtreesColumns.map((col, index) => (
                  <td key={index}
                    className={classNames("border border-slate-200 p-2", {"bg-slate-300": hoveredSubtrees.includes(index), "bg-gray-100": selectedSubtrees.includes(index)})} 
                    onMouseEnter={() => setIsHoveringOverId(subtreesColumnIds[col])} 
                    onMouseLeave={() => isHoveringOverId == subtreesColumnIds[col] && setIsHoveringOverId(undefined)}
                  >
                    {subtrees[row][col]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

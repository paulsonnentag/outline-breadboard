import { NodeViewProps } from "./index"
import { getNode, useGraph } from "../graph"
import { isString } from "../utils"

export function TableNodeView({ node }: NodeViewProps) {
  const { graph } = useGraph()

  const nodeId = node.id
  const cols = node.view?.includes("asCol") ?? false

  let fields: {
    [key: string]: string
  } = {}

  for (let childId of node.children) {
    const child = getNode(graph, childId)
    const index = isString(child.value) ? child.value.indexOf(":") : -1

    if (index >= 0) {
      const value = child.value as string

      fields[value.substring(0, index)] = value.substring(index + 1)
    }
  }

  let subtreesColumns: string[] = []
  let subtrees: {
    [row: string]: {
      [col: string]: string
    }
  } = {}

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
          }
        }
      }
    }
  }

  return (
    <div className="text-sm">
      {Object.keys(fields).length > 0 && (
        <table className="table-auto border-collapse border border-slate-100 text-right">
          <tbody>
            {Object.keys(fields).map((key) => (
              <tr key={key}>
                <td className="border border-slate-200 p-2 font-bold">{key}</td>
                <td className="border border-slate-200 p-2">{fields[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {Object.keys(subtrees).length > 0 && (
        <table className="table-auto border-collapse border border-slate-100 text-right">
          <thead>
            <tr>
              <th></th>
              {subtreesColumns.map((col, index) => (
                <th className="border border-slate-200 p-2 font-bold" key={index}>
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
                  <td className="border border-slate-200 p-2" key={index}>
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

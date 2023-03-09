import { NodeViewProps } from "./index"
import { LatLongProperty } from "./MapNodeView"
import { createNode, createRecordNode, getNode, Graph, useGraph, ValueNode } from "../graph"
import { useEffect } from "react"
import { Property } from "../property"
import useDebounce from "../hooks"

export function TableNodeView({ node }: NodeViewProps) {
  const { graph, changeGraph } = useGraph()

  const nodeId = node.id
  const cols = node.view?.includes("asCol") ?? false

  let fields: {
    [key: string]: string
  } = {}

  for (let childId of node.children) {
    const child = getNode(graph, childId)

    const index = child.value.indexOf(":")

    if (index >= 0) {
      fields[child.value.substring(0, index)] = child.value.substring(index + 1)
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

    if (!child.value.includes(":")) {
      for (let grandchildId of child.children) {
        const grandchild = getNode(graph, grandchildId)
    
        const index = grandchild.value.indexOf(":")
    
        if (index >= 0) {
          if (!subtrees[grandchild.value.substring(0, index)]) {
            subtrees[grandchild.value.substring(0, index)] = {}
          }

          subtrees[grandchild.value.substring(0, index)][child.value] = grandchild.value.substring(index + 1)
          
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
          {Object.keys(fields).map(key => (
            <tr>
              <td className="border border-slate-200 p-2 font-bold">{key}</td>
              <td className="border border-slate-200 p-2">{fields[key]}</td>
            </tr>
          ))}
        </table>
      )}

      {Object.keys(subtrees).length > 0 && (
        <table className="table-auto border-collapse border border-slate-100 text-right">
          <tr>
            <th></th>
            {subtreesColumns.map(col => (
              <th className="border border-slate-200 p-2 font-bold">{col}</th>
            ))}
          </tr>
          {Object.keys(subtrees).map(row => (
            <tr>
              <td className="border border-slate-200 p-2 font-bold">{row}</td>
              {subtreesColumns.map(col => (
                <td className="border border-slate-200 p-2">{subtrees[row][col]}</td>
              ))}
            </tr>
          ))}
        </table>
      )}
    </div>
  )
}

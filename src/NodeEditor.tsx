import { useNode } from "./graph";

interface NodeEditorProps {
  id: string
}

export function NodeEditor ({ id } : NodeEditorProps) {
  const { node } = useNode(id)


  if (!node) {
    return <div>Node</div>
  }

  return (<div>
    <div>{node.value}</div>
    {node.children.length > 0 && (<div>
      {node.children.map((childId) => <NodeEditor id={childId}/>) }
    </div>)}
  </div>)

}
import ContentEditable from "react-contenteditable"
import classNames from "classnames"
import { NodeViewProps } from "./index"

export function RootNodeView({ innerRef, node, onChangeValue }: NodeViewProps) {
  return (
    <div className="w-full">
      <ContentEditable
        className={classNames("mb-2 text-xl", {
          "is-untitled text-gray-300": !node.value,
        })}
        innerRef={innerRef}
        html={node.value}
        onChange={() => {
          onChangeValue(innerRef.current!.innerText)
        }}
      />
    </div>
  )
}

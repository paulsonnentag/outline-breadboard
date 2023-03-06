import classNames from "classnames"
import ContentEditable from "react-contenteditable"
import { NodeViewProps } from "./index"

export function BulletNodeView({ innerRef, node, onChangeValue, isFocused }: NodeViewProps) {
  return (
    <div className="w-full">
      <div className="flex gap-2">
        <span className={classNames({ invisible: !isFocused && node.value == "" })}>•</span>
        <ContentEditable
          innerRef={innerRef}
          html={node.value}
          onChange={(evt) => onChangeValue(evt.target.value)}
        />
      </div>
    </div>
  )
}

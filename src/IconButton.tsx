import { MouseEvent } from "react"

interface IconButtonProps {
  icon: string
  onClick: (evt: MouseEvent) => void
}

export function IconButton({ icon, onClick }: IconButtonProps) {
  return (
    <button className="material-icons text-gray-400 hover:text-gray-600" onClick={onClick}>
      {icon}
    </button>
  )
}

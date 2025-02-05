import { default as babel } from "./babel"
import { default as vite } from "./server"
import react from "@vitejs/plugin-react"

export function r3f() {
  return [
    vite(),
    react({
      babel: {
        plugins: [babel]
      }
    })
  ]
}

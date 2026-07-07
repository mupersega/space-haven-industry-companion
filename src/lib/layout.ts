import dagre from 'dagre'
import type { ChainEdge } from './cost'

export interface Sized {
  id: string
  width: number
  height: number
}

/**
 * Layered left-to-right layout: base materials end up on the left,
 * the final product on the right.
 */
export function layoutPositions(
  nodes: Sized[],
  edges: ChainEdge[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  // generous nodesep = vertical breathing room in LR mode, keeps edge labels clear of cards
  g.setGraph({ rankdir: 'LR', nodesep: 64, ranksep: 130, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  return new Map(
    nodes.map((n) => {
      const pos = g.node(n.id)
      return [n.id, { x: pos.x - n.width / 2, y: pos.y - n.height / 2 }]
    }),
  )
}

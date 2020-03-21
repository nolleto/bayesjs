import {
  IClique,
  IGraph,
  INetwork,
  ISepSet,
} from '../../types'
import {
  buildJunctionTree,
  buildMoralGraph,
  buildTriangulatedGraph,
} from '../../graphs'
import { isNil, map, pick, pipe, toString } from 'ramda'

import { buildCliqueGraph } from '../../graphs/cliqueGraph'
import { getNodesFromNetwork } from '../../utils'

interface ICreateCliquesResult {
  cliques: IClique[];
  sepSets: ISepSet[];
  junctionTree: IGraph;
}

const createCliquesWeakMap = new Map<string, ICreateCliquesResult>()

const getNetworkKey: (network: INetwork) => string = pipe(
  getNodesFromNetwork,
  map(pick(['id', 'cpt'])),
  toString,
)

export default (network: INetwork): ICreateCliquesResult => {
  const key = getNetworkKey(network)
  const cached = createCliquesWeakMap.get(key)

  if (isNil(cached)) {
    const moralGraph = buildMoralGraph(network)
    const triangulatedGraph = buildTriangulatedGraph(moralGraph)
    const { cliqueGraph, cliques, sepSets } = buildCliqueGraph(triangulatedGraph)
    const junctionTree = buildJunctionTree(cliqueGraph, cliques, sepSets)
    const result = { cliques, sepSets, junctionTree }

    createCliquesWeakMap.set(key, result)

    return result
  }

  return cached
}

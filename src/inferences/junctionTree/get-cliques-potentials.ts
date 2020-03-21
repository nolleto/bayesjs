import {
  IClique,
  ICliquePotentials,
  ICombinations,
  IGraph,
  INetwork,
  ISepSet,
} from '../../types'
import { isNotNil, normalizeCliquePotentials } from '../../utils'

import createInitialPotentials from './create-initial-potentials'
import { isNil } from 'ramda'
import propagatePotential from './propagate-potentials'

const defaultGiven = {}

const getCliquesPotentialsWeekMap = new WeakMap<IClique[], ICliquePotentials>()
const getGivensWeekMap = new WeakMap<ICombinations, boolean>()

const getCachedValues = (cliques: IClique[], given: ICombinations) => {
  const cachedByCliques = getCliquesPotentialsWeekMap.get(cliques)
  const cachedByGiven = getGivensWeekMap.get(given)

  if (isNotNil(cachedByCliques) && isNotNil(cachedByGiven)) {
    return cachedByCliques
  }

  return null
}

const setCachedValues = (cliques: IClique[], given: ICombinations, result: ICliquePotentials) => {
  getCliquesPotentialsWeekMap.set(cliques, result)
  getGivensWeekMap.set(given, true)
}

export default (cliques: IClique[], network: INetwork, junctionTree: IGraph, sepSets: ISepSet[], given: ICombinations = defaultGiven) => {
  const cached = getCachedValues(cliques, given)

  if (isNil(cached)) {
    const cliquesPotentials = createInitialPotentials(cliques, network, given)
    const finalCliquesPotentials = propagatePotential(network, junctionTree, cliques, sepSets, cliquesPotentials)
    const result = normalizeCliquePotentials(finalCliquesPotentials)

    setCachedValues(cliques, given, result)

    return result
  }

  return cached
}

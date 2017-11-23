import { isEqual, intersection, cloneDeep } from 'lodash';
import { INetwork, INode } from './types/index';
import hash from 'object-hash';

// const weakMap = new WeakMap();
// const map = new Map();

const wmJT = new WeakMap();
const wmKey = new WeakMap();
const map = new Map();
let rootIndex = 0;

const getKeyNetwork = (network: INetwork) => {
  const keyCached = wmKey.get(network);

  if (keyCached) return keyCached;

  const obj = Object.keys(network)
    .reduce((p, nodeId) => {
      const { id, parents, states, cpt } = network[nodeId];
      p[id] = { id, parents, states, cpt };
      return p;
    }, {});
  
  const key = JSON.stringify(obj);
  
  wmKey.set(network, key);
  return key;
};

const getKeyGiven = (given) => {
  const keys = Object.keys(given);
  
  if (keys.length) {
    return keys.map(nodeId => ({ nodeId, state: given[nodeId] }))
      .reduce((str, {nodeId, state}) => `${str}-${nodeId}-${state}`, '')
  }
  
  return "NO GIVEN";
};

export const clearCache = () => {
  map.clear();
}

export function infer(network, nodes, given = {}, root = 0) {
  rootIndex = root;
  const key = getKeyNetwork(network);
  
  let cachedJT2 = map.get(key);
  
  if (cachedJT2 === undefined) {
    map.clear();
    cachedJT2 = createCliquesInfo(network);
    map.set(key, cachedJT2);  
  }
  const { emptyCliques, sepSets, junctionTree } = cachedJT2;
  const cliques = propagationCliques(emptyCliques, network, junctionTree, sepSets, given);
  
  // TODO: considerar P(A,B,C), por enquanto só P(A)
  const nodesToInfer = Object.keys(nodes);
  const nodeToInfer = nodesToInfer[0];
  const stateToInfer = nodes[nodeToInfer];
  
  return getResult(cliques, nodeToInfer, stateToInfer);
};

const getResult = (cliques, nodeToInfer, stateToInfer) => {
  // const key = `${nodeToInfer}-${stateToInfer}`;
  // const cachedResult = map.get(key);
  // if (cachedResult !== undefined) return cachedResult;
  
  const cliquesNode = cliques.filter(x => x.clique.some(y => y === nodeToInfer));
  const clique = cliquesNode.reduce((maximal, current) => {
    if (current.clique.length < maximal.clique.length) return current;
    return maximal;
  });
  
  const values = clique.potentials
    .filter(x => x.when[nodeToInfer] === stateToInfer)
    .map(x => x.then);

  const result = values.reduce((acc, x) => acc + x);
  // map.set(key, result);

  return result;
}

const checkConsistency = (network, cliques) => {
  const dict = new Map();

  for (const clique of cliques) {
    const nodesIds = clique.clique;

    for (const nodeId of nodesIds) {
      const states = network[nodeId].states;
      
      for (const state of states) {
        const key = `${clique.id}-${nodeId}-${state}`;
        const value = clique.potentials
          .filter(({ when }) => when[nodeId] === state)
          .reduce((acc, { then }) => acc + then, 0);

        dict.set(key, value);
      }
    }
  }
  console.log(dict);
};

const createCliquesInfo = (network) => {
  const moralGraph = buildMoralGraph(network);
  const triangulatedGraph = buildTriangulatedGraph(moralGraph);
  const { cliqueGraph, cliques, sepSets } = buildCliqueGraph(triangulatedGraph, network);
  const junctionTree = buildJunctionTree(cliqueGraph, cliques, sepSets);

  return {
    emptyCliques: cliques, 
    sepSets,
    junctionTree,
  };
};

const propagationCliques = (cliques, network, junctionTree, sepSets, given) => {
  const key = getKeyGiven(given);
  const cached = map.get(key);
  if (cached !== undefined) return cached;
  
  initializePotentials(cliques, network, given);
  globalPropagation(network, junctionTree, cliques, sepSets);

  const result = normalize(cliques);
  map.set(key, result);
  return result;
};

const normalize = (cliques) => {
  return cliques.map(({ id, potentials, clique }) => ({
    id,
    clique,
    potentials: normalizePotentials(potentials)
  }));
};

const normalizePotentials = (potentials) => {
  const sum = potentials.reduce((acc, { then }) => acc + then, 0);
  
  return potentials.map(({ when, then }) => ({
    when,
    then: then / sum,
  }));
}

const getsepSet = (sepSets, id, neighborId) => {
  const temp = sepSets.find(x => {
    return (x.ca === neighborId && x.cb === id) || (x.ca === id && x.cb === neighborId);
  });

  return temp.sharedNodes.sort();
};

const createMessage = (combinations, potentials, messageReceived = null) => {
  const initCombs = combinations.map(x => ({ when: x, then: 0 }))
  const message = [];

  for (const { when } of initCombs) {
    const keys = Object.keys(when);
    const newThen = potentials
      .filter(potential => keys.every(x => when[x] === potential.when[x]))
      .map(x => x.then)
      .reduce((acc, x) => acc + x);
      
      message.push({
        then: newThen,
        when: cloneDeep(when),
      });
  }

  if (messageReceived) {
    for (const row of message) {
      const { when, then } = row;
      const whenKeys = Object.keys(when);
      const mr = messageReceived.find((mr) => whenKeys.every(wk => mr.when[wk] === when[wk]));
      const value = then / (mr.then || 1);
      
      row.then = value;
    }
  }

  // return normalizePotentials(message);
  return message;
};

const divideMessage = (clique, message) => {
  if (message.length) {
    const keys = Object.keys(message[0].when);

    for (const row of message) {
      clique.potentials
        .filter(potential => {
          return keys.every(x => row.when[x] === potential.when[x]);
        })
        .forEach(potential => {
          potential.then = potential.then / row.then;
        });
    }
  }
};

const removeFromArray = (array, string) => {
  const index = array.indexOf(string);
  if (index !== -1) {
      array.splice(index, 1);
  }
};

const absorvMessage = (clique, message) => {
  // if (clique.missingVariables.length === 0) return;//Already absorv all variables
  
  if (message.length) {
    const keys = Object.keys(message[0].when);

    for (const row of message) {
      clique.potentials
        .filter(potential => {
          return keys.every(x => row.when[x] === potential.when[x]);
        })
        .forEach(potential => {
          potential.then = potential.then * row.then;
        });
    }
  }
};

const bestRootIndex = () => {
  return rootIndex;
};

const globalPropagation = (network, junctionTree, cliques, sepSets) => {
  let marked = [];
  const nonParentNodes = Object.keys(network)
    .map(nodeId => network[nodeId])
    .filter(({ parents }) => parents.length === 0)
    .map(({ id }) => id);

  const unmark = (id) => {
    marked = marked.filter(x => x !== id);
  };

  const unmarkAll = () => {
    marked = [];
  };

  const isMarked = id => {
    return marked.some(x => x === id);
  };

  const mark = id => {
    marked.push(id);
  };

  const collectEvidence = (id, parentId = null) => {
    mark(id);

    const neighbors = junctionTree.getNeighborsOf(id)
      .filter(x => !isMarked(x));

    for (const neighbor of neighbors) {
      collectEvidence(neighbor, id);
    }

    if (parentId !== null) {
      const clique = cliques.find(x => x.id === id);
      const sepSet = getsepSet(sepSets, id, parentId).filter(x => nonParentNodes.indexOf(x) === -1);
      const potentials = clique.potentials;
      const combinations = buildCombinations(network, sepSet);
      const message = createMessage(combinations, potentials);
      const parent = cliques.find(x => x.id === parentId);

      // parent.oldPotentials = clone(parent.potentials);
      parent.messagesReceived.set(clique.id, message);
      absorvMessage(parent, message);
    }

    unmark(id);
  };

  const distributeEvidence = id => {
    mark(id);

    const clique = cliques.find(x => x.id === id);
    // const potentials = clique.oldPotentials;
    const { messagesReceived, potentials } = clique;

    const neighbors = junctionTree.getNeighborsOf(id)
      .filter(x => !isMarked(x));
    
    for (const neighborId of neighbors) {
      const sepSet = getsepSet(sepSets, id, neighborId).filter(x => nonParentNodes.indexOf(x) === -1);
      const messageReceived = messagesReceived.get(neighborId);
      const combinations = buildCombinations(network, sepSet);
      const message = createMessage(combinations, potentials, messageReceived);
      const neighbor = cliques.find(x => x.id === neighborId);

      absorvMessage(neighbor, message);
      distributeEvidence(neighborId);
    }

    unmark(id);
  };

  if (cliques.length > 1) {
    const nodes = junctionTree.getNodes();
    const root = nodes[bestRootIndex()];
    // const root = nodes[nodes.length - 1];

    unmarkAll();
    collectEvidence(root);

    unmarkAll();
    distributeEvidence(root);
  }
};

const initializePotentials = (cliques, network, given) => {
  const givenKeys = Object.keys(given);
  const getInitalValue = (comb) => {
    if (givenKeys.length) {
      const combKeys = Object.keys(comb);
      const inter = intersection(givenKeys, combKeys);
      
      if (combKeys.length) {
        const all = inter.every((gk) => comb[gk] == given[gk]);
        
        return all ? 1 : 0;
      }
    }
    return 1;
  }

  for (const clique of cliques) {
    clique.factors = [];
    clique.potentials = [];
    clique.messagesReceived = new Map();
    clique.missingVariables = clique.clique.filter(nodeId => {
      const node = network[nodeId];
      if (node.parents.length == 0) return false;

      return node.parents.filter(parentId => clique.clique.indexOf(parentId) === -1).length > 0
    });
  }

  for (const nodeId of Object.keys(network)) {
    const node = network[nodeId];
    const nodes = node.parents.concat(node.id);

    for (const clique of cliques) {
      if (nodes.every(x => clique.clique.some(y => x === y))) {
        clique.factors.push(nodeId);
        //break?
      }
    }
  }

  for (const clique of cliques) {
    const combinations = buildCombinations(network, clique.clique);

    for (const combination of combinations) {
      let value = getInitalValue(combination);

      if (value > 0) {
        for (const factorId of clique.factors) {
          const factor = network[factorId];

          if (factor.parents.length > 0) {
            const when = network[factorId].parents
              .reduce((acc, x) => ({ ...acc, [x]: combination[x] }), {});

            const cptRow = factor.cpt.find(x => isEqual(x.when, when));

            value *= cptRow.then[combination[factorId]];
          } else {
            value *= factor.cpt[combination[factorId]];
          }
        }
      }
      
      clique.potentials.push({
        when: combination,
        then: value
      });
    }

    delete clique.factors;
  }
};

const buildCombinations = (network, nodesToCombine) => {
  const combinations = [];

  const makeCombinations = (nodes, acc = {}) => {
    if (nodes.length === 0) {
      combinations.push(acc);
      return;
    }

    const [ nodeId, ...rest ] = nodes;
    const states = network[nodeId].states;

    for (const state of states) {
      makeCombinations(rest, {
        ...acc,
        [nodeId]: state
      });
    }
  };

  makeCombinations(nodesToCombine);

  return combinations;
};

const buildJunctionTree = (cliqueGraph, cliques, sepSets) => {
  sepSets.sort((a, b) => b.sharedNodes.length - a.sharedNodes.length);

  const spanningTree = [];

  const hasCycle = () => {
    const visited = {};

    const visit = (cliqueId, parentId) => {
      visited[cliqueId] = true;

      const adjsA = spanningTree
        .filter(x => x.ca === cliqueId)
        .map(x => x.cb);

      const adjsB = spanningTree
        .filter(x => x.cb === cliqueId)
        .map(x => x.ca);

      const adjs = adjsA.concat(adjsB);

      for (const adj of adjs) {
        if (!visited[adj]) {
          if (visit(adj, cliqueId)) {
            return true;
          }
        } else if (adj !== parentId) {
          return true;
        }
      }

      return false;
    };

    for (let i = 0; i < cliques.length; i++) {
      visited[cliques[i].id] = false;
    }

    for (let i = 0; i < cliques.length; i++) {
      if (!visited[cliques[i].id]) {
        if (visit(cliques[i].id, null)) {
          return true;
        }
      }
    }

    return false;
  };

  for (let i = 0; i < sepSets.length; i++) {
    spanningTree.push(sepSets[i]);

    if (hasCycle()) {
      spanningTree.pop();
    }
  }

  const junctionTree = cliqueGraph.clone();

  for (let i = sepSets.length - 1; i >= 0; i--) {
    const shouldRemove = !spanningTree.some(x => x === sepSets[i]);

    if (shouldRemove) {
      junctionTree.removeEdge(sepSets[i].ca, sepSets[i].cb);
      sepSets.splice(i, 1);
    }
  }

  return junctionTree;
};

const buildCliqueGraph = (triangulatedGraph, net) => {
  const cliqueGraph = createGraph();

  const cliques = [];
  const nodes = triangulatedGraph.getNodes();

  for (let i = 0; i < nodes.length; i++) {
    const clique = [ nodes[i] ];

    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      // else if (intersection(net[nodes[i]].network, net[nodes[j]].network).length > 0) continue;
      // else if (net[nodes[i]].network !== net[nodes[j]].network) continue;

      if (clique.every(node => triangulatedGraph.areConnected(node, nodes[j]))) {
        clique.push(nodes[j]);
      }
    }

    clique.sort();

    if (!cliques.some(x => isEqual(x.clique, clique))) {
      cliques.push({
        id: cliques.length.toString(),
        clique
      });
    }
  }

  const sepSets = [];

  for (let i = 0; i < cliques.length; i++) {
    cliqueGraph.addNode(cliques[i].id);

    for (let j = i + 1; j < cliques.length; j++) {
      if (i === j) {
        continue;
      }

      const sharedNodes = [];

      for (let k = 0; k < cliques[j].clique.length; k++) {
        if (cliques[i].clique.some(x => x === cliques[j].clique[k])) {
          sharedNodes.push(cliques[j].clique[k]);
        }
      }

      if (sharedNodes.length > 0) {
        cliqueGraph.addEdge(cliques[i].id, cliques[j].id);
        sepSets.push({ ca: cliques[i].id, cb: cliques[j].id, sharedNodes });
      }
    }
  }

  return {
    cliqueGraph,
    cliques,
    sepSets
  };
};

const buildTriangulatedGraph = moralGraph => {
  const triangulatedGraph = moralGraph.clone();
  const clonedGraph = triangulatedGraph.clone();
  const nodes = clonedGraph.getNodes();
  const nodesToRemove = [ ...nodes ];

  const findLessNeighbors = () => {
    if (nodesToRemove.length == 1) return nodesToRemove.shift();
    let index = 0;
    let candidateNeighbors = clonedGraph.getNeighborsOf(nodesToRemove[index]);

    for (let i = 1; i < nodesToRemove.length; i++) {
      const node = nodesToRemove[i];
      const neighbors = clonedGraph.getNeighborsOf(node);

      if (neighbors.length < candidateNeighbors.length) {
        index = i;
        candidateNeighbors = neighbors;
      }
    }

    const node = nodesToRemove[index];
    nodesToRemove.splice(index, 1);
    return node;
  };

  while (nodesToRemove.length > 0) {
    const nodeToRemove = findLessNeighbors();
    const neighbors = clonedGraph.getNeighborsOf(nodeToRemove).filter(id => nodesToRemove.indexOf(id) > -1);
    
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const neighborA = neighbors[i];
        const neighborB = neighbors[j];

        if (!clonedGraph.containsNode(neighborA) || !clonedGraph.containsNode(neighborB)) {
          continue;
        }

        if (!clonedGraph.areConnected(neighborA, neighborB)) {
          clonedGraph.addEdge(neighborA, neighborB);
          triangulatedGraph.addEdge(neighborA, neighborB);
        }
      }
    }

    clonedGraph.removeNode(nodeToRemove.node);
  }

  return triangulatedGraph;
};

const buildMoralGraph = network => {
  const nodes = Object.keys(network).map(id => network[id]);
  const moralGraph = createGraph();

  for (const node of nodes) {
    moralGraph.addNode(node.id);

    for (const parentId of node.parents) {
      moralGraph.addEdge(parentId, node.id);
    }
  }

  for (const node of nodes) {
    for (let i = 0; i < node.parents.length; i++) {
      for (let j = i + 1; j < node.parents.length; j++) {
        if (!moralGraph.areConnected(node.parents[i], node.parents[j])) {
          moralGraph.addEdge(node.parents[i], node.parents[j]);
        }
      }
    }
  }

  return moralGraph;
};

const createGraph = () => {
  const nodes = [];
  const edges = [];

  const addNode = node => {
    nodes.push(node);
  };

  const removeNode = node => {
    for (let i = edges.length - 1; i >= 0; i--) {
      if (edges[i][0] === node || edges[i][1] === node) {
        edges.splice(i, 1);
      }
    }

    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i] === node) {
        nodes.splice(i, 1);
        break;
      }
    }
  };

  const getNodes = () => {
    return nodes;
  };

  const containsNode = node => {
    return nodes.some(x => x === node);
  };

  const addEdge = (nodeA, nodeB) => {
    edges.push([ nodeA, nodeB ]);
  };

  const removeEdge = (nodeA, nodeB) => {
    for (let i = edges.length - 1; i >= 0; i--) {
      const shouldRemove =
        (edges[i][0] === nodeA && edges[i][1] === nodeB) ||
        (edges[i][0] === nodeB && edges[i][1] === nodeA);

      if (shouldRemove) {
        edges.splice(i, 1);
      }
    }
  };

  const areConnected = (nodeA, nodeB) => {
    return edges.some(edge => {
      return (edge[0] === nodeA && edge[1] === nodeB) || 
        (edge[0] === nodeB && edge[1] === nodeA);
    });
  };

  const getNeighborsOf = node => {
    const neighbors = [];

    for (const edge of edges) {
      if (edge[0] === node) {
        neighbors.push(edge[1]);
      } else if (edge[1] === node) {
        neighbors.push(edge[0]);
      }
    }

    return neighbors;
  };

  const clone = () => {
    const clonedGraph = createGraph();

    for (const node of nodes) {
      clonedGraph.addNode(node);
    }

    for (const edge of edges) {
      clonedGraph.addEdge(edge[0], edge[1]);
    }

    return clonedGraph;
  };

  return {
    addNode,
    removeNode,
    getNodes,
    containsNode,
    addEdge,
    removeEdge,
    areConnected,
    getNeighborsOf,
    clone,
    print: () => {
      console.log('nodes');
      console.dir(nodes);
      console.log('edges');
      console.dir(edges);
    }
  };
};
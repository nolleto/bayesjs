import { INodeList, INetwork } from '../types/index';
import { networkToNodeList } from './index';

interface IDict {
  [id: string] : {
    childs: string[]
    parents: string[]
  }
}

const getInitDict = (nodeIds: string[]): IDict =>
  nodeIds.reduce((acc, nodeId) => ({
    ...acc,
    [nodeId]: {
      childs: [],
      parents: []
    }
  }), {})

const fillDict = (dict: IDict, nodes: INodeList) => {
  for (const node of nodes) {
    dict[node.id].parents = node.parents;

    for (const parentId of node.parents) {
      const t = dict[parentId].childs;
      dict[parentId].childs = [...t, node.id];
    }
  }
}

const removeEdgeMaker = (dict: IDict) => (id1: string, id2: string) => {
  dict[id2].childs = dict[id2].childs.filter(x => x != id1);
  dict[id2].parents = dict[id2].parents.filter(x => x != id1);

  dict[id1].childs = dict[id1].childs.filter(x => x != id2);
  dict[id1].parents = dict[id1].parents.filter(x => x != id2);
};

const isCyclic = (dict) => {
  return Object.keys(dict).some(key => {
    const value = dict[key];

    return value.childs.length > 0 || value.parents.length > 0;
  })
}

const initS = (dict: IDict, nodeIds: string[]) => {
  return nodeIds.reduce((acc, nodeId) => {
    if (dict[nodeId].parents.length == 0) {
      acc.push(nodeId);
    }
    return acc;
  }, [] as string[]);
}

export const topologicalSort = (nodes: INodeList) => {
  const nodeIds = nodes.map(n => n.id);
  const dict = getInitDict(nodeIds);
  const removeEdge = removeEdgeMaker(dict);
  
  fillDict(dict, nodes)

  const s = initS(dict, nodeIds);
  const l = [];

  while (s.length > 0) {
    const n = s.shift();
    l.push(n);

    for (const m of dict[n].childs) {
      removeEdge(n, m);

      if (dict[m].parents.length == 0) {
        s.push(m);
      }
    }
  }

  const cyclic = isCyclic(dict);

  return {
    cyclic,
    sort: l
  };
}

export const hasCycle = (networkOrNodes: INetwork | INodeList) => {
  const nodes = Array.isArray(networkOrNodes) 
    ? networkOrNodes 
    : networkToNodeList(networkOrNodes);
  const { cyclic } = topologicalSort(nodes);
  
  return cyclic;
}
import * as expect from 'expect';
import { hasCycle, createNetwork } from '../../src/utils';
import { rain, grassWet, sprinkler } from '../../models/rain-sprinkler-grasswet';
import { allNodes } from '../../models/alarm';

describe('utils', () => {
  describe('topologicalSort', () => {
    it('should have no cycle with list of nodes', () => {
      const nodes = [rain, grassWet, sprinkler];
      const cyclic = hasCycle(nodes);

      expect(cyclic).toBeFalsy();
    })

    it('should have no cycle with network', () => {
      const network = createNetwork(...allNodes);
      const cyclic = hasCycle(network);

      expect(cyclic).toBeFalsy();
    })

    it('should have cycle with list of nodes', () => {
      const newRain = {
        ...rain,
        parents: [ 'GRASS_WET' ]
      };
      const nodes = [newRain, grassWet, sprinkler];
      const cyclic = hasCycle(nodes);

      expect(cyclic).toBeTruthy();
    })

    it('should have cycle with network', () => {
      const newRain = {
        ...rain,
        parents: [ 'GRASS_WET' ]
      };
      const nodes = [newRain, grassWet, sprinkler];
      const network = nodes.reduce((acc, node) => ({
        ...acc,
        [node.id]: node
      }), {});
      const cyclic = hasCycle(network);

      expect(cyclic).toBeTruthy();
    })
  })
})


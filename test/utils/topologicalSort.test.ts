import * as expect from 'expect';
import { hasCycle, createNetwork } from '../../src/utils';
import { rain, grassWet, sprinkler } from '../../models/rain-sprinkler-grasswet';
import { allNodes } from '../../models/alarm';
import { cloneDeep } from 'lodash';

describe('utils', () => {
  describe('topologicalSort', () => {
    it('should have no cycle with network', () => {
      const network = createNetwork(...allNodes);
      const cyclic = hasCycle(network);

      expect(cyclic).toBeFalsy();
    })

    it('should have no cycle', () => {
      const nodes = [rain, grassWet, sprinkler];
      const cyclic = hasCycle(nodes);

      expect(cyclic).toBeFalsy();
    })

    it('should have cycle', () => {
      const newRain = {
        ...cloneDeep(rain),
        parents: [ 'GRASS_WET' ]
      };
      const nodes = [newRain, grassWet, sprinkler];
      const cyclic = hasCycle(nodes);

      expect(cyclic).toBeTruthy();
    })
  })
})


/** *****************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 ****************************************************************************** */

const resourceTemplate = {
  cluster: id => ({
    kind: 'cluster',
    name: `mock-cluster${id > 0 ? `-${id}` : ''}`,
    namespace: 'mock-mcm-cluster',
    status: 'ok',
    endpoint: '',
    nodes: 10,
    cpu: '30%',
    memory: '20%',
    storage: '10%',
  }),
  node: (id = 0) => ({
    kind: 'node',
    name: `mock-1.1.1.${id}`,
    cpus: 10,
    role: 'master',
  }),
  pod: id => ({
    kind: 'pod',
    name: `mock-cluster${id > 0 ? `-${id}` : ''}`,
    namespace: 'kube-system',
    restarts: 20,
    creationTimestamp: '2018-09-27 16:52:20 -0400 EDT',
    status: 'Running',
    hostIP: '179.160.35.59',
    podIP: '179.160.35.59',
  }),
};

// export function repeat(map, count) {
//   return new Array(count).fill(0).map(map);
// }

export const mockSearchResult = {
  /**
   * Mock search results.
   *
   * Pass the kind and amount of objects to mock.
   * For example, to mock a search that returns 2 clusters and 5 pods:
   *    { cluster: 2, pod:5 }
   */
  mock: (args) => {
    const mockResult = [];

    // Get items
    Object.keys(args).forEach((kind) => {
      for (let i = 0; i < args[kind]; i += 1) {
        const mockItem = { ...resourceTemplate[kind](i) };
        mockResult.push(mockItem);
      }
    });

    return mockResult;
  },
};


/* eslint-disable class-methods-use-this */
export default class MockSearchConnector {
  async runSearchQuery() {
    return mockSearchResult.mock({ cluster: 2, node: 3, pod: 5 });
  }

  async runSearchQueryCountOnly() {
    return 100;
  }

  async getAllProperties() {
    return ['name', 'namespace'];
  }

  async getAllValues(property) {
    return [`${property}-0`, `${property}-1`, `${property}-2`];
  }

  async findRelationships() {
    return [];
  }
}

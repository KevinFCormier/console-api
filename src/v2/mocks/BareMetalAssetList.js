/** *****************************************************************************
 * Licensed Materials - Property of Red Hat, Inc.
 * Copyright (c) 2020 Red Hat, Inc. All Rights Reserved.
 ****************************************************************************** */

const mockResponse = {
  body: {
    apiVersion: 'v1',
    items: [
      {
        apiVersion: 'inventory.open-cluster-management.io/v1alpha1',
        kind: 'BareMetalAsset',
        metadata: {
          annotations: {
            'kubectl.kubernetes.io/last-applied-configuration': '{"apiVersion":"inventory.open-cluster-management.io/v1alpha1","kind":"BareMetalAsset","metadata":{"annotations":{},"name":"baremetalasset-worker-0","namespace":"fake-cluster"},"spec":{"bmc":{"address":"ipmi://192.168.122.1:6233","credentialsName":"worker-0-bmc-secret"},"bootMACAddress":"00:1B:44:11:3A:B7","clusterDeployment":{"name":"cluster0","namespace":"cluster0"},"hardwareProfile":"hardwareProfile","role":"worker"}}\n',
          },
          creationTimestamp: '2020-03-05T12:01:11Z',
          generation: 1,
          name: 'baremetalasset-worker-0',
          namespace: 'fake-cluster',
          resourceVersion: '579175',
          selfLink: '/apis/inventory.open-cluster-management.io/v1alpha1/namespaces/fake-cluster/baremetalassets/baremetalasset-worker-0',
          uid: 'cb6eaf0e-2a60-4c4c-b068-2a4257fcce42',
        },
        spec: {
          bmc: {
            address: 'ipmi://192.168.122.1:6233',
            credentialsName: 'worker-0-bmc-secret',
          },
          bootMACAddress: '00:1B:44:11:3A:B7',
          clusterDeployment: {
            name: 'cluster0',
            namespace: 'cluster0',
          },
          hardwareProfile: 'hardwareProfile',
          role: 'worker',
        },
      },
      {
        apiVersion: 'inventory.open-cluster-management.io/v1alpha1',
        kind: 'BareMetalAsset',
        metadata: {
          annotations: {
            'kubectl.kubernetes.io/last-applied-configuration': '{"apiVersion":"inventory.open-cluster-management.io/v1alpha1","kind":"BareMetalAsset","metadata":{"annotations":{},"name":"baremetalasset-worker-1","namespace":"fake-cluster"},"spec":{"bmc":{"address":"ipmi://192.168.122.2:6233","credentialsName":"worker-1-bmc-secret"},"bootMACAddress":"00:1B:44:11:3A:B6","clusterDeployment":{"name":"cluster0","namespace":"cluster0"},"hardwareProfile":"hardwareProfile","role":"worker"}}\n',
          },
          creationTimestamp: '2020-03-06T12:37:27Z',
          generation: 1,
          name: 'baremetalasset-worker-1',
          namespace: 'fake-cluster',
          resourceVersion: '1186911',
          selfLink: '/apis/inventory.open-cluster-management.io/v1alpha1/namespaces/fake-cluster/baremetalassets/baremetalasset-worker-1',
          uid: 'f27a1799-e913-4d7e-a83b-875454210afb',
        },
        spec: {
          bmc: {
            address: 'ipmi://192.168.122.2:6233',
            credentialsName: 'worker-1-bmc-secret',
          },
          bootMACAddress: '00:1B:44:11:3A:B6',
          clusterDeployment: {
            name: 'cluster0',
            namespace: 'cluster0',
          },
          hardwareProfile: 'hardwareProfile',
          role: 'worker',
        },
      },
    ],
    kind: 'List',
    metadata: {
      resourceVersion: '',
      selfLink: '',
    },
  },
};

export const singleAsset = {
  body: {
    apiVersion: 'inventory.open-cluster-management.io/v1alpha1',
    kind: 'BareMetalAsset',
    metadata: {
      annotations: {
        'kubectl.kubernetes.io/last-applied-configuration': '{"apiVersion":"inventory.open-cluster-management.io/v1alpha1","kind":"BareMetalAsset","metadata":{"annotations":{},"name":"baremetalasset-worker-0","namespace":"fake-cluster"},"spec":{"bmc":{"address":"ipmi://192.168.122.1:6233","credentialsName":"worker-0-bmc-secret"},"bootMACAddress":"00:1B:44:11:3A:B7","clusterDeployment":{"name":"cluster0","namespace":"cluster0"},"hardwareProfile":"hardwareProfile","role":"worker"}}\n',
      },
      creationTimestamp: '2020-03-05T12:01:11Z',
      generation: 1,
      name: 'baremetalasset-worker-0',
      namespace: 'fake-cluster',
      resourceVersion: '579175',
      selfLink: '/apis/inventory.open-cluster-management.io/v1alpha1/namespaces/fake-cluster/baremetalassets/baremetalasset-worker-0',
      uid: 'cb6eaf0e-2a60-4c4c-b068-2a4257fcce42',
    },
    spec: {
      bmc: {
        address: 'ipmi://192.168.122.1:6233',
        credentialsName: 'worker-0-bmc-secret',
      },
      bootMACAddress: '00:1B:44:11:3A:B7',
      clusterDeployment: {
        name: 'cluster0',
        namespace: 'cluster0',
      },
      hardwareProfile: 'hardwareProfile',
      role: 'worker',
    },
  },
};

export default mockResponse;
/** *****************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 ****************************************************************************** */

export const typeDef = `
# MCM Application
type Application implements K8sObject {
  applicationRelationships: [ApplicationRelationship]
  # URL to Grafana Dashboard
  dashboard: String
  deployables: [Deployable]
  metadata: Metadata
  placementPolicies: [PlacementPolicy]
  # The object's yaml definition in JSON format.
  raw: JSON
  selector: JSON
}

type ApplicationRelationship implements K8sObject {
  destination: DeployableDependency
  metadata: Metadata
  source: DeployableDependency
  type: String
  # The object's yaml definition in JSON format.
  raw: JSON
}

type Deployable implements K8sObject {
  dependencies: [DeployableDependency]
  deployer: HelmDeployer
  metadata: Metadata
  # The object's yaml definition in JSON format.
  raw: JSON
}

type PlacementPolicy implements K8sObject {
  clusterSelector: JSON
  metadata: Metadata
  # The object's yaml definition in JSON format.
  raw: JSON
  replicas: Int
  resourceSelector: JSON
}

type DeployableDependency {
  kind: String
  name: String
}

type HelmDeployer {
  chartName: String
  namespace: String
  repository: String
  version: String
}

`;

/* eslint-disable max-len */
export const resolver = {
  Query: {
    applications: (root, args, { applicationModel }) => applicationModel.getApplications(args.name, args.namespace),
    deployables: (root, args, { applicationModel }) => applicationModel.getDeployables(args.selector),
    placementPolicies: (root, args, { applicationModel }) => applicationModel.getPlacementPolicies(args.selector),
  },
  Application: {
    applicationRelationships: (parent, args, { applicationModel }) =>
      applicationModel.getApplicationRelationships({ matchNames: parent.applicationRelationshipNames }),
    deployables: (parent, args, { applicationModel }) =>
      applicationModel.getDeployables({ matchNames: parent.deployableNames }),
    placementPolicies: (parent, args, { applicationModel }) =>
      applicationModel.getPlacementPolicies({ matchNames: parent.placementPolicyNames }),
  },
  Mutation: {
    createApplication: (root, args, { applicationModel }) => applicationModel.createApplication(args.resources),
    deleteApplication: (root, args, { applicationModel }) => applicationModel.deleteApplication(args.namespace, args.name),
  },
};

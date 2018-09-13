/** *****************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 ****************************************************************************** */

import supertest from 'supertest';
import server, { GRAPHQL_PATH } from '../index';

describe('Compliance Resolver', () => {
  test('Correctly Resolves Compliance List Query', (done) => {
    supertest(server)
      .post(GRAPHQL_PATH)
      .send({
        query: `
        {
          compliances {
            name
            namespace
            kind
            clusterSelector
            policyCompliant
            clusterCompliant
          }
        }
      `,
      })
      .end((err, res) => {
        expect(res.text).toMatchSnapshot();
        done();
      });
  });

  test('Correctly Resolves Single Compliance Query', (done) => {
    supertest(server)
      .post(GRAPHQL_PATH)
      .send({
        query: `
        {
          compliances(name:"compliance-xz",namespace:"mcm") {
            name
            namespace
            kind
            clusterSelector
            policyCompliant
            clusterCompliant
          }
        }
      `,
      })
      .end((err, res) => {
        expect(res.text).toMatchSnapshot();
        done();
      });
  });

  test('Correctly Resolves Create Compliance Mutation', (done) => {
    supertest(server)
      .post(GRAPHQL_PATH)
      .send({
        query: `
        mutation {
          createCompliance(resources:[{
            apiVersion: "compliance.mcm.ibm.com/v1alpha1",
            kind: "Compliance",
            metadata: {
              name: "test-compliance",
              namespace: "mcm",
              description: "Instance descriptor for compliance resource",
            },
            spec: {
              clusterSelector: {
                matchNames: [
                  "mycluster",
                ],
              },
              runtimeRules: [
                {
                  apiVersion: "policy.mcm.ibm.com/v1alpha1",
                  kind: "Policy",
                  metadata: {
                    name: "test-policy-1",
                    description: "Instance descriptor for policy resource",
                  },
                  spec: {
                    remediationAction: "inform",
                    namespaces: {
                      include: [
                        "default",
                      ],
                      exclude: [
                        "kube*",
                      ],
                    },
                    roleTemplates: [
                      {
                        kind: "RoleTemplate",
                        apiVersion: "roletemplate.mcm.ibm.com/v1alpha1",
                        complianceType: "musthave",
                        metadata: {
                          namespace: "",
                          name: "role-xz-1",
                        },
                        selector: {
                          matchLabels: {
                            cloud: "IBM",
                          },
                        },
                        rules: [
                          {
                            complianceType: "musthave",
                            PolicyRule: {
                              apiGroups: [
                                "extensions",
                                "apps",
                              ],
                              resources: [
                                "deployments",
                              ],
                              verbs: [
                                "get",
                                "list",
                                "watch",
                                "create",
                                "delete",
                                "patch",
                              ],
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
                {
                  apiVersion: "policy.mcm.ibm.com/v1alpha1",
                  kind: "Policy",
                  metadata: {
                    name: "test-policy-2",
                    description: "Instance descriptor for policy resource",
                  },
                  spec: {
                    remediationAction: "enforce",
                    namespaces: {
                      include: [
                        "default",
                      ],
                      exclude: [
                        "kube*",
                      ],
                    },
                    roleTemplates: [
                      {
                        kind: "RoleTemplate",
                        apiVersion: "roletemplate.mcm.ibm.com/v1alpha1",
                        complianceType: "musthave",
                        metadata: {
                          namespace: "",
                          name: "role-xz-2",
                        },
                        selector: {
                          matchLabels: {
                            cloud: "IBM",
                          },
                        },
                        rules: [
                          {
                            complianceType: "musthave",
                            PolicyRule: {
                              apiGroups: [
                                "extensions",
                                "apps",
                              ],
                              resources: [
                                "deployments",
                              ],
                              verbs: [
                                "get",
                                "list",
                                "watch",
                                "delete",
                              ],
                            },
                          },
                          {
                            complianceType: "mustnothave",
                            PolicyRule: {
                              apiGroups: [
                                "core",
                              ],
                              resources: [
                                "pods",
                              ],
                              verbs: [
                                "create",
                                "update",
                                "patch",
                              ],
                            },
                          },
                          {
                            PolicyRule: {
                              apiGroups: [
                                "core",
                              ],
                              resources: [
                                "secrets",
                              ],
                              verbs: [
                                "get",
                                "watch",
                                "list",
                                "create",
                                "delete",
                                "update",
                                "patch",
                              ],
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          }])
        }
      `,
      })
      .end((err, res) => {
        expect(res.text).toMatchSnapshot();
        done();
      });
  });

  test('Correctly Resolves Delete Compliance Mutation', (done) => {
    supertest(server)
      .post(GRAPHQL_PATH)
      .send({
        query: `
        mutation {
          deleteCompliance(name:"compliance-xz",namespace:"mcm")
        }
      `,
      })
      .end((err, res) => {
        expect(res.text).toMatchSnapshot();
        done();
      });
  });
});
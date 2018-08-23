/** *****************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 ****************************************************************************** */

import _ from 'lodash';
import logger from '../lib/logger';
import requestLib from '../lib/request';
import KubeConnector from '../connectors/kube';
import config from '../../../config';


const POLICY_FAILURE_STATUS = 'Failure';

// The last char(s) in usage are units - need to be removed in order to get an int for calculation
function getPercentage(usage, capacity) {
  return (usage.substring(0, usage.length - 2) / capacity.substring(0, capacity.length - 2)) * 100;
}

function getCPUPercentage(usage, capacity) {
  return ((usage.substring(0, usage.length - 1) / 1000) / capacity) * 100;
}

function getComplianceObject(res) {
  const statusArray = [];
  const selectors = _.get(res, 'spec.clusterSelector', []);

  let totalClusters = 0;
  let compliantClusters = 0;
  let totalPolicies = 0;
  let compliantPolicies = 0;

  const selectorArray = Object.entries(selectors).map(([selectorType, selector]) =>
    ({ selectorType, selector }));
  const status = _.get(res, 'status', []);
  if (status) totalClusters = Object.keys(status).length;
  Object.entries(status).forEach(([key, cluster]) => {
    const policies = [];
    let clusterCompliant = true;
    Object.entries(cluster).forEach(([policyKey, policyValue]) => {
      totalPolicies += 1;
      if (_.get(policyValue, 'policyValue.Compliant', '').toLowerCase() === 'compliant') compliantPolicies += 1;
      else clusterCompliant = false;
      policies.push({ policyKey, compliant: policyValue.Compliant || '', valid: policyValue.Valid || '' });
    });
    if (clusterCompliant) compliantClusters += 1;
    statusArray.push({
      namespace: key,
      cluster: key,
      policies,
    });
  });
  const compliance = {
    name: _.get(res, 'metadata.name', 'none'),
    namespace: _.get(res, 'metadata.namespace', 'none'),
    kind: _.get(res, 'kind', 'Compliance'),
    clusterSelector: selectorArray,
    policyCompliant: `${compliantPolicies}/${totalPolicies}`,
    clusterCompliant: `${compliantClusters}/${totalClusters}`,
  };
  compliance.complianceStatus = statusArray;
  return compliance;
}

function getPolicyObject(response, target) {
  const templates = [];
  const rules = [];
  const responseTemplates = [];
  const violations = [];
  const policySpec = _.get(response, 'spec', []);

  // for now, `-templates` is the special key word that server side uses
  // to identify if an attribute is template arrays or not
  // only support role-templates and generic-templates
  Object.entries(policySpec).forEach(([key, value]) => {
    if (key.endsWith('-templates')) {
      value.forEach(item => responseTemplates.push({ ...item, templateType: key }));
    }
  });

  const detail = {
    uid: _.get(response, 'metadata.uid', 'none'),
    resourceVersion: _.get(response, 'metadata.resourceVersion', 'none'),
    annotations: _.get(response, 'metadata.annotations', ''),
    selfLink: _.get(response, 'metadata.selfLink', '-'),
    creationTime: _.get(response, 'metadata.creationTimestamp', '-'),
    exclude_namespace: _.get(response, 'spec.namespaces.exclude', ['*']),
    include_namespace: _.get(response, 'spec.namespaces.include', ['*']),
  };

  responseTemplates.forEach((res) => {
    // type: PolicyTemplate
    const template = {
      name: _.get(res, 'metadata.name', '-'),
      lastTransition: _.get(res, 'status.conditions[0].lastTransitionTime', ''),
      complianceType: _.get(res, 'complianceType', ''),
      apiVersion: _.get(res, 'apiVersion', ''),
      compliant: _.get(res, 'status.Compliant', ''),
      validity: _.get(res, 'status.Validity.valid') || _.get(res, 'status.Validity', ''),
      selector: _.get(res, 'selector', ''),
      templateType: _.get(res, 'templateType', ''),
    };
    const templateCondition = _.get(res, 'status.conditions[0]');

    // type: Violations
    const violation = {
      name: _.get(res, 'metadata.name', '-'),
      cluster: 'local', // local means the cluster that this policy is applied
      status: _.get(res, 'status.Validity.valid', false) ? _.get(response, 'status.Compliant', 'unknown') : 'invalid',
      message: (templateCondition && _.get(templateCondition, 'message', 'unknown')) || 'unknown',
      reason: (templateCondition && _.get(templateCondition, 'reason', 'unknown')) || 'unknown',
      selector: _.get(res, 'selector', ''),
    };
    violations.push(violation);

    // type: PolicyRules
    if (res.rules) {
      Object.entries(res.rules).forEach(([key, rul]) => {
        const complianceType = _.get(rul, 'complianceType');
        if (complianceType) {
          const rule = {
            complianceType,
            apiGroups: _.get(rul, 'policyRule.apiGroups', ['-']),
            resources: _.get(rul, 'policyRule.resources', ['-']),
            verbs: _.get(rul, 'policyRule.verbs', ['-']),
            templateType: _.get(res, 'templateType', ''),
            ruleUID: `${_.get(res, 'metadata.name', '-')}-rule-${key}`,
          };
          rules.push(rule);
        }
      });
    }
    templates.push(template);
  });
  return {
    ...target,
    templates,
    rules,
    violations,
    detail,
    namespace: _.get(response, 'metadata.namespace', 'none'),
    status: _.get(response, 'status.Valid', false) === false ? 'invalid' : _.get(response, 'status.Compliant', 'unknown'),
    enforcement: _.get(response, 'spec.remediationAction', 'unknown'),
  };
}

function getStatus(cluster) {
  const status = _.get(cluster, 'status.conditions[0].type', 'unknown');
  return status === '' ? 'unknown' : status.toLowerCase();
}

export default class KubeModel {
  constructor({ kubeConnector, token, httpLib = requestLib }) {
    if (kubeConnector) {
      this.kubeConnector = kubeConnector;
    } else if (token && httpLib) {
      this.kubeConnector = new KubeConnector({ token, httpLib });
    } else {
      throw new Error('Either initialize with KubeConnector or token + httpLib');
    }
  }

  async createPolicy(resources) {
    // TODO: revist this, do something like application,
    // combine policy and compliance into one mutation
    let errorMessage = '';
    const result = await Promise.all(resources.map((resource) => {
      const namespace = _.get(resource, 'metadata.namespace', 'default');
      return this.kubeConnector.post(`/apis/policy.hcm.ibm.com/v1alpha1/namespaces/${namespace}/policies`, resource)
        .catch(err => console.log(err));
    }));
    result.forEach((item) => {
      if (item.code > 300 || item.status === POLICY_FAILURE_STATUS) {
        errorMessage += `${item.message}\n`;
      }
    });
    if (errorMessage) {
      throw new Error(errorMessage);
    } else {
      // TODO: add partical errors
      return result;
    }
  }

  async createCompliance(resources) {
    let errorMessage = '';
    const result = await Promise.all(resources.map((resource) => {
      const namespace = _.get(resource, 'metadata.namespace', 'default');
      return this.kubeConnector.post(`/apis/compliance.hcm.ibm.com/v1alpha1/namespaces/${namespace}/compliances`, resource)
        .catch(err => console.log(err));
    }));
    result.forEach((item) => {
      if (item.code > 300 || item.status === POLICY_FAILURE_STATUS) {
        errorMessage += `${item.message}\n`;
      }
    });
    if (errorMessage) {
      throw new Error(errorMessage);
    } else {
      // TODO: add partical errors
      return result;
    }
  }

  async getApplications(name) {
    const response = await this.kubeConnector.get('/apis/mcm.ibm.com/v1alpha1/applications');
    if (response.code || response.message) {
      logger.error(`MCM ERROR ${response.code} - ${response.message}`);
      return [];
    }

    const items = name ? response.items.filter(app => app.metadata.name === name) : response.items;
    return items.map((app) => {
      const components = [];
      const dependencies = [];
      const relationships = [];
      const { annotations } = app.metadata;

      if (app.status && app.status.Deployable) {
        // FIXME: API should return an array.
        const deployables = Array.isArray(app.status.Deployable) ? app.status.Deployable : [app.status.Deployable]; // eslint-disable-line max-len
        deployables.forEach((component) => {
          components.push({
            name: component.metadata.name,
            namespace: component.metadata.namespace,
            created: component.metadata.creationTimestamp,
            labels: component.metadata.labels,
            annotations: component.metadata.annotations,
          });

          // Get dependencies for each component.
          if (component.spec && component.spec.dependencies) {
            component.spec.dependencies.forEach((dep) => {
              dependencies.push({
                name: dep.destination.name,
                type: dep.destination.kind,
              });
              relationships.push({
                source: component.metadata.name,
                destination: dep.destination.name,
                type: 'dependsOn',
              });
            });
          }
        });
      }


      return {
        annotations,
        components,
        dashboard: app.status.Dashboard,
        dependencies,
        labels: app.metadata.labels,
        name: app.metadata.name,
        relationships,
        namespace: app.metadata.namespace,
        created: app.metadata.creationTimestamp,
        selfLink: app.metadata.selfLink,
        resourceVersion: app.metadata.resourceVersion,
        uid: app.metadata.uid,
        status: app.metadata.status,
      };
    });
  }

  async getClusters() {
    const response = await this.kubeConnector.get('/apis/clusterregistry.k8s.io/v1alpha1/clusters');
    if (response.code || response.message) {
      logger.error(`MCM ERROR ${response.code} - ${response.message}`);

      // TODO: How should we handle errors? - 07/25/18 10:20:57 sidney.wijngaarde1@ibm.com
      return [];
    }

    const clusterStatus = await this.getClusterStatus();
    const result = [];

    response.items.forEach((cluster, idx) => {
      result.push({
        createdAt: cluster.metadata.creationTimestamp,
        clusterip: clusterStatus[idx].ip,
        labels: cluster.metadata.labels,
        name: cluster.metadata.name,
        namespace: cluster.metadata.namespace,
        status: getStatus(cluster),
        uid: cluster.metadata.uid,
        nodes: clusterStatus[idx].nodes,
        totalMemory: parseInt(clusterStatus[idx].memoryUtilization, 10),
        totalStorage: parseInt(clusterStatus[idx].storageUtilization, 10),
      });
    });
    return result;
  }

  async getClusterStatus() {
    const response = await this.kubeConnector.get('/apis/mcm.ibm.com/v1alpha1/clusterstatuses');
    if (response.code || response.message) {
      logger.error(`HCM ERROR ${response.code} - ${response.message}`);
      return [];
    }

    const result = [];
    response.items.forEach((cluster) => {
      result.push({
        createdAt: cluster.metadata.creationTimestamp,
        labels: cluster.metadata.labels,
        name: cluster.metadata.name,
        namespace: cluster.metadata.namespace,
        uid: cluster.metadata.uid,
        nodes: cluster.spec.capacity.nodes,
        pods: cluster.spec.usage.pods,
        ip: cluster.spec.masterAddresses[0].ip,
        memoryUtilization: getPercentage(
          cluster.spec.usage.memory,
          cluster.spec.capacity.memory,
        ),
        storageUtilization: getPercentage(
          cluster.spec.usage.storage,
          cluster.spec.capacity.storage,
        ),
        cpuUtilization: getCPUPercentage(
          cluster.spec.usage.cpu,
          cluster.spec.capacity.cpu,
        ),
      });
    });
    return result;
  }

  async getPods() {
    const response = await this.kubeConnector.resourceViewQuery('pods');
    return Object.keys(response.status.results).reduce((accum, clusterName) => {
      const pods = response.status.results[clusterName].items;

      pods.map(pod => accum.push({
        cluster: clusterName,
        containers: pod.spec.containers,
        createdAt: pod.metadata.creationTimestamp,
        hostIP: pod.status.hostIP,
        labels: pod.metadata.labels,
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        owners: pod.metadata.ownerReferences,
        podIP: pod.status.podIP,
        startedAt: pod.status.startTime,
        status: pod.status.phase,
        uid: pod.metadata.uid,
      }));

      return accum;
    }, []);
  }

  async getRepos() {
    const response = await this.kubeConnector.get('/apis/mcm.ibm.com/v1alpha1/helmrepos');
    if (response.code || response.message) {
      logger.error(`MCM ERROR ${response.code} - ${response.message}`);
      return [];
    }
    return response.items.map(cluster => ({
      Name: cluster.metadata.name,
      URL: cluster.spec.url,
    }));
  }

  async getCompliances(name, namespace = 'hcm') {
    // for getting compliance list
    const arr = [];
    if (!name) {
      const response = await this.kubeConnector.get(`/apis/compliance.hcm.ibm.com/v1alpha1/namespaces/${config.get('complianceNamespace') || 'hcm'}/compliances`);
      if (response.code || response.message) {
        logger.error(`HCM ERROR ${response.code} - ${response.message}`);
        return [];
      }
      if (response.items) {
        response.items.forEach((res) => {
          arr.push(getComplianceObject(res));
        });
      }
    } else {
      // get single policy from a specific namespace
      const response = await this.kubeConnector.get('/apis/compliance.hcm.ibm.com/v1alpha1/compliances');
      if (response.code || response.message) {
        logger.error(`HCM ERROR ${response.code} - ${response.message}`);
        return [];
      }
      if (response.items) {
        let compliance = {};
        const complianceStatus = [];
        const filteredResponseData = response.items.filter(item => _.get(item, 'metadata.name') === name);
        filteredResponseData.forEach((complianceData) => {
          const complianceNamespace = _.get(complianceData, 'metadata.namespace');
          if (complianceNamespace === namespace) {
            compliance = getComplianceObject(complianceData);
            // compliance details for compliance-detail-page
            const detail = {
              uid: _.get(complianceData, 'metadata.uid', 'none'),
              resourceVersion: _.get(complianceData, 'metadata.resourceVersion', 'none'),
              selfLink: _.get(complianceData, 'metadata.selfLink', '-'),
              creationTime: _.get(complianceData, 'metadata.creationTimestamp', ''),
            };
            compliance.detail = detail;
          } else {
            const statusLocal = _.get(complianceData, 'statusLocal.aggregatePoliciesStates', {});
            // find out policy namespace
            Object.entries(statusLocal).forEach(([key, value]) => {
              let policyObject = {
                name: key,
                cluster: complianceNamespace,
                compliant: _.get(value, 'Compliant', '-'),
                valid: _.get(value, 'Valid', '-'),
                complianceName: name,
                complianceNamespace: namespace,
              };
              const spec = _.get(complianceData, 'spec', {});
              let targetPolicy;
              Object.values(spec).forEach((compliancePolicyArray) => {
                targetPolicy = compliancePolicyArray.find(item => _.get(item, 'metadata.name') === key);
              });
              if (targetPolicy) policyObject = getPolicyObject(targetPolicy, policyObject);
              complianceStatus.push(policyObject);
            });
          }
        });
        compliance.complianceStatus = complianceStatus;
        arr.push(compliance);
      }
    }
    return arr;
  }

  async getPolicies(name, namespace = 'default') {
    // if policy name specified, return a single policy with details
    if (name !== undefined) {
      const arr = [];

      const response = await this.kubeConnector.get(`/apis/policy.hcm.ibm.com/v1alpha1/namespaces/${namespace}/policies/${name}`);
      if (response.code || response.message) {
        logger.error(`HCM ERROR ${response.code} - ${response.message}`);
        return [];
      }
      const policy = {
        name: _.get(response, 'metadata.name', 'none'),
      };

      arr.push(getPolicyObject(response, policy));
      return arr;
    }

    // for getting policy list
    const response = await this.kubeConnector.get('/apis/policy.hcm.ibm.com/v1alpha1/policies');
    if (response.code || response.message) {
      logger.error(`HCM ERROR ${response.code} - ${response.message}`);
      return [];
    }
    const arr = [];
    if (response.items) {
      response.items.forEach((res) => {
        const policy = {
          name: _.get(res, 'metadata.name', 'none'),
          namespace: _.get(res, 'metadata.namespace', 'none'),
          status: _.get(res, 'status.Valid', false) === false ? 'invalid' : _.get(res, 'status.Compliant', 'unknown'),
          enforcement: _.get(res, 'spec.remediationAction', 'unknown'),
        };
        arr.push(policy);
      });
    }
    return arr;
  }

  async setRepo(input) {
    const jsonBody = {
      apiVersion: 'mcm.ibm.com/v1alpha1',
      kind: 'HelmRepo',
      metadata: {
        name: input.Name,
      },
      spec: {
        url: input.URL,
      },
    };
    const response = await this.kubeConnector.post('/apis/mcm.ibm.com/v1alpha1/namespaces/default/helmrepos', jsonBody);
    if (response.code || response.message) {
      logger.error(`MCM ERROR ${response.code} - ${response.message}`);
      return [];
    }
    return {
      Name: response.metadata.name,
      URL: response.spec.url,
    };
  }

  async deleteRepo(input) {
    const response = await this.kubeConnector.delete(`/apis/mcm.ibm.com/v1alpha1/namespaces/default/helmrepos/${input.Name}`);
    if (response.code || response.message) {
      logger.error(`MCM ERROR ${response.code} - ${response.message}`);
      return [];
    }
    return {
      Name: response.metadata.name,
      URL: response.spec.url,
    };
  }

  async deleteCompliance(input) {
    const response = await this.kubeConnector.delete(`/apis/compliance.hcm.ibm.com/v1alpha1/namespaces/${input.namespace}/compliances/${input.name}`);
    if (response.code || response.message) {
      throw new Error(`MCM ERROR ${response.code} - ${response.message}`);
    }
    return response.metadata.name;
  }

  async deletePolicy(input) {
    const response = await this.kubeConnector.delete(`/apis/policy.hcm.ibm.com/v1alpha1/namespaces/${input.namespace}/policies/${input.name}`);
    if (response.code || response.message) {
      throw new Error(`MCM ERROR ${response.code} - ${response.message}`);
    }
    return response.metadata.name;
  }

  async getNodes() {
    const response = await this.kubeConnector.resourceViewQuery('nodes');
    return Object.keys(response.status.results).reduce((accum, clusterName) => {
      const nodes = response.status.results[clusterName].items;

      nodes.map(node => accum.push({
        allocatable: node.status.allocatable,
        architecture: node.status.nodeInfo.architecture,
        capacity: node.status.capacity,
        cluster: clusterName,
        createdAt: node.metadata.creationTimestamp,
        labels: node.metadata.labels,
        name: node.metadata.name,
        images: node.status.images.reduce((imageNames, curr) => {
          imageNames.push(...curr.names);
          return imageNames;
        }, []),
        operatingSystem: node.status.nodeInfo.operatingSystem,
        osImage: node.status.nodeInfo.osImage,
        startedAt: node.status.startTime,
        status: node.status.phase,
        uid: node.metadata.uid,
      }));

      return accum;
    }, []);
  }

  async getNamespaces() {
    const response = await this.kubeConnector.resourceViewQuery('namespaces');
    return Object.keys(response.status.results).reduce((accum, clusterName) => {
      const namespaces = response.status.results[clusterName].items;

      namespaces.map(namespace => accum.push({
        cluster: clusterName,
        createdAt: namespace.metadata.creationTimestamp,
        labels: namespace.metadata.labels,
        name: namespace.metadata.name,
        status: namespace.status.phase,
        uid: namespace.metadata.uid,
      }));

      return accum;
    }, []);
  }

  async getCharts() {
    const response = await this.kubeConnector.get('/apis/mcm.ibm.com/v1alpha1/helmrepos');
    if (response.code || response.message) {
      logger.error(`MCM ERROR ${response.code} - ${response.message}`);
      return [];
    }
    const charts = [];
    response.items.forEach((cluster) => {
      const rName = cluster.metadata.name;
      if (cluster.status.charts) {
        const repo = Object.values(cluster.status.charts);
        repo.forEach((chart) => {
          charts.push({
            repoName: rName,
            name: chart.chartVersions[0].name,
            version: chart.chartVersions[0].version,
            urls: chart.chartVersions[0].urls,
          });
        });
      }
    });
    return charts;
  }

  async getReleases() {
    const response = await this.kubeConnector.resourceViewQuery('releases');
    return Object.keys(response.status.results).reduce((accum, clusterName) => {
      const rels = response.status.results[clusterName].items;

      rels.map(rel => accum.push({
        chartName: rel.spec.chartName,
        chartVersion: rel.spec.chartVersion,
        namespace: rel.spec.namespace,
        status: rel.spec.status,
        version: rel.spec.version,
        name: rel.metadata.name,
        cluster: clusterName,
        lastDeployed: new Date(rel.spec.lastDeployed).getTime() / 1000,
      }));

      return accum;
    }, []);
  }

  // This is not currently implemented as we are unable to delete the "default" cluster releases
  // To avoid confusion the remove action has been removed from releases table.
  async deleteRelease(input) {
    // TODO: Zack L - Need to make sure releases installed remotly always begin with md- in name.
    // currently have to strip the md- so name matches the work created for the release
    const deploymentName = input.name.substring(3);
    const response = await this.kubeConnector.delete(`/apis/mcm.ibm.com/v1alpha1/namespaces/mcm-${input.cluster}/works/${deploymentName}`);
    if (response.code || response.message) {
      logger.error(`MCM ERROR ${response.code} - ${response.message}`);
      return [{
        code: response.code,
        message: response.message,
      }];
    }

    return [{
      name: response.metadata.name,
      namespace: response.spec.helm.namespace,
      status: response.status.type,
      cluster: response.spec.cluster.name,
    }];
  }

  async installHelmChart(input) {
    const {
      chartURL, namespace, releaseName, clusters,
    } = input;

    return clusters.map(async (cluster) => {
      const workNamespace = `mcm-${cluster}`;
      const jsonBody = {
        apiVersion: 'mcm.ibm.com/v1alpha1',
        kind: 'Work',
        metadata: {
          name: releaseName,
          namespace: workNamespace,
        },
        spec: {
          cluster: {
            name: cluster,
          },
          type: 'Deployer',
          helm: {
            chartURL,
            namespace,
          },
        },
      };

      const response = await this.kubeConnector.post(`/apis/mcm.ibm.com/v1alpha1/namespaces/mcm-${cluster}/works`, jsonBody);
      if (response.code || response.message) {
        logger.error(`MCM ERROR ${response.code} - ${response.message}`);
        return [{
          code: response.code,
          message: response.message,
        }];
      }

      return {
        name: response.metadata.name,
        namespace: response.spec.helm.namespace,
        status: response.status.type,
        cluster: response.spec.cluster.name,
      };
    });
  }
}

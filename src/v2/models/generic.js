/** *****************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018, 2019. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 ****************************************************************************** */

import _ from 'lodash';
import KubeModel from './kube';
import logger from '../lib/logger';

export default class GenericModel extends KubeModel {
  async getResourceEndPoint(resource, k8sPaths) {
    // dynamically get resource endpoint from kebernetes API
    // ie.https://ec2-54-84-124-218.compute-1.amazonaws.com:8443/kubernetes/
    if (k8sPaths) {
      const { apiVersion, kind } = resource;
      const apiPath = k8sPaths.paths.find(path => path.match(`/[0-9a-zA-z]*/?${apiVersion}`));
      if (apiPath) {
        return (async () => {
          const k8sResourceList = await this.kubeConnector.get(`${apiPath}`);
          const resourceType = k8sResourceList.resources.find(item => item.kind === kind);
          const namespace = _.get(resource, 'metadata.namespace');
          const { name, namespaced } = resourceType;
          if (namespaced && !namespace) {
            return null;
          }
          const requestPath = `${apiPath}/${namespaced ? `namespaces/${namespace}/` : ''}${name}`;
          return requestPath;
        })();
      }
    }
    return undefined;
  }

  async createResources(args) {
    const { resources } = args;
    const k8sPaths = await this.kubeConnector.get('/');
    // get resource end point for each resource
    const requestPaths = await Promise.all(resources.map(async resource =>
      this.getResourceEndPoint(resource, k8sPaths)));
    if (requestPaths.length === 0 || requestPaths.includes(undefined)) {
      if (requestPaths.length > 0) {
        const resourceIndex = requestPaths.indexOf(undefined);
        return {
          errors: [{ message: `Cannot find resource type "${resources[resourceIndex].apiVersion}"` }],
        };
      }
      return {
        errors: [{ message: 'Cannot find resource path' }],
      };
    } else if (requestPaths.includes(null)) {
      return {
        errors: [{ message: 'Namespace not found in the template' }],
      };
    }
    const result = await Promise.all(resources.map((resource, index) =>
      this.kubeConnector.post(requestPaths[index], resource)
        .catch(err => ({
          status: 'Failure',
          message: err.message,
        }))));

    const errors = [];
    result.forEach((item) => {
      if (item.code >= 400 || item.status === 'Failure' || item.message) {
        errors.push({ message: item.message });
      }
    });
    return {
      errors,
      result,
    };
  }

  async patchResource(args) {
    /*
    update k8s resources' labels
    the Content-Type is 'application/json-patch+json'
    the request body should look like:
    [{
     "op": "replace", "path": "/metadata/labels", "value": {
            "cloud": "IBM",
            "datacenter": "toronto",
            "environment": "Dev"
        }
     }]
    */
    let endpointURL = '';
    let resourceName = '';
    let response;
    const {
      namespace, name, resourceType, body, resourcePath, selfLink,
    } = args;
    const requestBody = {
      body: [
        {
          op: 'replace',
          path: resourcePath,
          value: body,
        },
      ],
    };
    if (!selfLink) {
      switch (resourceType) {
        case 'HCMCluster':
          endpointURL = 'clusterregistry.k8s.io';
          resourceName = 'clusters';
          break;
        default:
          throw new Error('MCM ERROR cannot find matched resource type');
      }
      response = await this.kubeConnector.patch(`/apis/${endpointURL}/v1alpha1/namespaces/${namespace}/${resourceName}/${name}`, requestBody);
    } else {
      // will use selfLink by default
      response = await this.kubeConnector.patch(`${selfLink}`, requestBody);
    }
    if (response && (response.code || response.message)) {
      throw new Error(`${response.code} - ${response.message}`);
    }
    return response;
  }

  async putResource(args) {
    /*
    update k8s resources
    the Content-Type is 'application/json'
    the request body should look like:
    {
      "apiVersion": "compliance.mcm.ibm.com/v1alpha1",
      "kind": "Compliance",
      "metadata": {
        "name": "compliance-test-3",
        "finalizers": [
          "finalizer.mcm.ibm.com"
        ],
        "generation": 1,
        "namespace": "mcm",
        "resourceVersion": "2462226"
      },
     }
    */
    let endpointURL = '';
    let resourceName = '';
    let response;
    const {
      namespace, name, resourceType, body, selfLink,
    } = args;
    const requestBody = {
      body,
    };

    if (!selfLink) {
      switch (resourceType) {
        case 'HCMCompliance':
          endpointURL = 'compliance.mcm.ibm.com';
          resourceName = 'compliances';
          break;
        default:
          throw new Error('MCM ERROR cannot find matched resource type');
      }
      response = await this.kubeConnector.put(`/apis/${endpointURL}/v1alpha1/namespaces/${namespace}/${resourceName}/${name}`, requestBody);
    } else {
      // will use selfLink by default
      response = await this.kubeConnector.put(`${selfLink}`, requestBody);
    }
    if (response && (response.code || response.message)) {
      throw new Error(`${response.code} - ${response.message}`);
    }
    return response;
  }

  async resourceAction(resourceType, actionType, resourceName, resourceNamespace, clusterName) {
    const name = `${resourceType}-workset-${this.kubeConnector.uid()}`;
    const body = {
      apiVersion: 'mcm.ibm.com/v1alpha1',
      kind: 'WorkSet',
      metadata: {
        name,
      },
      spec: {
        clusterSelector: {
          matchLabels: {
            name: clusterName,
          },
        },
        template: {
          spec: {
            type: 'Action',
            actionType,
          },
        },
      },
    };
    if (resourceType === 'helm') {
      body.spec.template.spec.helm = {
        releaseName: resourceName,
        namespace: resourceNamespace,
      };
    } else {
      body.spec.template.spec.kube = {
        resource: resourceType,
        name: resourceName,
        namespace: resourceNamespace,
      };
    }

    const response = await this.kubeConnector.post(`/apis/mcm.ibm.com/v1alpha1/namespaces/${this.kubeConnector.resourceViewNamespace}/worksets`, body);
    if (response.status === 'Failure' || response.code >= 400) {
      throw new Error(`Create Resource Action Failed [${response.code}] - ${response.message}`);
    }

    const { cancel, promise: pollPromise } = this.kubeConnector.pollView(_.get(response, 'metadata.selfLink'));

    try {
      const result = await Promise.race([pollPromise, this.kubeConnector.timeout()]);
      logger.debug('result:', result);
      if (result) {
        this.kubeConnector.delete(`/apis/mcm.ibm.com/v1alpha1/namespaces/${this.kubeConnector.resourceViewNamespace}/worksets/${response.metadata.name}`)
          .catch(e => logger.error(`Error deleting workset ${response.metadata.name}`, e.message));
      }
      const reason = _.get(result, 'status.reason');
      if (reason) {
        throw new Error(`Failed to delete ${resourceName}: ${reason}`);
      } else {
        return _.get(result, 'metadata.name');
      }
    } catch (e) {
      logger.error('Resource Action Error:', e.message);
      cancel();
      throw e;
    }
  }

  async getLogs(containerName, podName, podNamespace, clusterName) {
    if (clusterName === 'local-cluster') { // TODO: Use flag _hubClusterResource instead of cluster name
      return this.kubeConnector.get(`/api/v1/namespaces/${podNamespace}/pods/${podName}/log?container=${containerName}&tailLines=1000`);
    }
    const cluster = await this.kubeConnector.getResources(ns => `/apis/clusterregistry.k8s.io/v1alpha1/namespaces/${ns}/clusters/${clusterName}`);
    if (cluster && cluster.length === 1) {
      const clusterNamespace = cluster[0].metadata.namespace;
      return this.kubeConnector.get(`/apis/mcm.ibm.com/v1alpha1/namespaces/${clusterNamespace}/clusterstatuses/${clusterName}/log/${podNamespace}/${podName}/${containerName}?tailLines=1000`, { json: false }, true);
    }
    throw new Error(`Unable to find the cluster called ${clusterName}`);
  }

  // Generic query to get raw data for any resource local || remote
  async getResource(selfLink, namespace, kind, name, cluster = '') {
    if (cluster === 'local-cluster' && selfLink && selfLink !== '') {
      return this.kubeConnector.get(selfLink);
    }
    // if not local cluster -> need to create a resource query to get remote resource
    const response = await this.kubeConnector.resourceViewQuery(kind, cluster, name, namespace);
    if (response.status.results) {
      return response.status.results[cluster];
    }
    return [{ message: 'Unable to load resource data - Check to make sure the cluster hosting this resource is online' }];
  }

  async updateResource(args) {
    const {
      selfLink, namespace, kind, name, body, cluster,
    } = args;
    const requestBody = { body };
    // If updating resource on local cluster use selfLink
    if (cluster === 'local-cluster' && selfLink && selfLink !== '') {
      const response = await this.kubeConnector.put(selfLink, requestBody);
      if (response.message) {
        throw new Error(`${response.code} - ${response.message}`);
      }
      return response;
    }
    const clusterResponse = await this.kubeConnector.getResources(ns => `/apis/clusterregistry.k8s.io/v1alpha1/namespaces/${ns}/clusters/${cluster}`);
    const clusterNamespace = clusterResponse[0].metadata.namespace;
    // Else If updating resource on remote cluster use an Action Type Work
    const workName = `${name}-update-work-${this.kubeConnector.uid()}`;
    const jsonBody = {
      apiVersion: 'mcm.ibm.com/v1alpha1',
      kind: 'Work',
      metadata: {
        name: workName,
        namespace: clusterNamespace,
      },
      spec: {
        cluster: {
          name: cluster,
        },
        type: 'Action',
        scope: {
          resourceType: kind,
          namespace,
        },
        actionType: 'Update',
        kube: {
          resource: kind,
          name,
          namespace,
          template: body,
        },
      },
    };
    const response = await this.kubeConnector.post(`/apis/mcm.ibm.com/v1alpha1/namespaces/${clusterNamespace}/works`, jsonBody);
    if (response.code || response.message) {
      logger.error(`MCM ERROR ${response.code} - ${response.message}`);
      return [{
        code: response.code,
        message: response.message,
      }];
    }
    const { cancel, promise: pollPromise } = this.kubeConnector.pollView(_.get(response, 'metadata.selfLink'));

    try {
      const result = await Promise.race([pollPromise, this.kubeConnector.timeout()]);
      if (result) {
        this.kubeConnector.delete(`/apis/mcm.ibm.com/v1alpha1/namespaces/${clusterNamespace}/works/${response.metadata.name}`)
          .catch(e => logger.error(`Error deleting work ${response.metadata.name}`, e.message));
      }
      const reason = _.get(result, 'status.reason');
      if (reason) {
        throw new Error(`Failed to Update ${name}: ${reason}`);
      } else {
        return _.get(result, 'metadata.name');
      }
    } catch (e) {
      logger.error('Resource Action Error:', e.message);
      cancel();
      throw e;
    }
  }

  async deleteResource(selfLink, childResources) {
    const errors = this.deleteChildResource(childResources);
    if (errors && errors.length > 0) {
      throw new Error(`MCM ERROR: Unable to delete child resource(s) - ${JSON.stringify(errors)}`);
    }

    const response = await this.kubeConnector.delete(selfLink, {});
    if (response.status === 'Failure' || response.code >= 400) {
      throw new Error(`Failed to delete the requested resource [${response.code}] - ${response.message}`);
    }
    return response;
  }

  async deleteChildResource(resources) {
    if (resources.length < 1) {
      logger.info('No child resources selected for deletion');
      return [];
    }

    const result = await Promise.all(resources.map(resource =>
      this.kubeConnector.delete(resource.selfLink)
        .catch(err => ({
          status: 'Failure',
          message: err.message,
        }))));

    const errors = [];
    result.forEach((item) => {
      if (item.code >= 400 || item.status === 'Failure') {
        errors.push({ message: item.message });
      }
    });
    return errors;
  }

  async userAccess(resource, action, namespace = '', group = '') {
    const body = {
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectAccessReview',
      spec: {
        resourceAttributes: {
          verb: action,
          resource,
          namespace,
          group,
        },
      },
    };
    const response = await this.kubeConnector.post('/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', body);
    if (response.status === 'Failure' || response.code >= 400) {
      throw new Error(`Get User Access Failed [${response.code}] - ${response.message}`);
    }
    return response.status;
  }
}

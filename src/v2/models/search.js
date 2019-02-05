/** *****************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 ****************************************************************************** */

import { isRequired } from '../lib/utils';

// TODO: Keyword filtering currently requires that we transfer a large number of records from the
// gremlin-server to filter locally. We need to investigate alternatives to improve performance.
function filterByKeywords(resultSet, keywords) {
  /* Regular expression resolves to a string like:
   *     /(?=.*keyword1)(?=.*keyword2)(?=.*keyword3)/gi
   * which matches if the string contains all keywords and is case insensitive. */
  const regex = new RegExp(keywords.reduce((prev, curr) => `${prev}(?=.*${curr})`, ''), 'gi');

  return resultSet.filter(r => Object.values(r).toString().match(regex));
}
export default class SearchModel {
  constructor({ searchConnector = isRequired('searchConnector') }) {
    this.searchConnector = searchConnector;
  }

  async getUpdatedTimestamp() {
    return this.searchConnector.getLastUpdatedTimestamp();
  }

  async resolveSearch({ keywords, filters }) {
    if (keywords) {
      const results = await this.searchConnector.runSearchQuery(filters);
      return filterByKeywords(results, keywords);
    }
    return this.searchConnector.runSearchQuery(filters);
  }

  async resolveSearchCount({ keywords, filters }) {
    if (keywords) {
      const results = await this.searchConnector.runSearchQuery(filters);
      return filterByKeywords(results, keywords).length;
    }
    return this.searchConnector.runSearchQueryCountOnly(filters);
  }

  async resolveSearchComplete({ property, filters }) {
    return this.searchConnector.getAllValues(property, filters);
  }

  /** Resolve the related items for a given search query.
   *
   * @param {*} parent
   * returns { kind: String, count: Int, items: [] }
   */
  async resolveRelated(parent) {
    const relationships = await this.searchConnector.findRelationships(parent);

    const result = {};
    relationships.forEach((r) => {
      if (!result[r.kind]) {
        result[r.kind] = [];
      }
      result[r.kind].push(r);
    });

    return Object.keys(result).map(r => ({ kind: r, count: result[r].length, items: result[r] }));
  }

  async searchSchema() {
    return {
      allProperties: await this.searchConnector.getAllProperties(),
    };
  }
}

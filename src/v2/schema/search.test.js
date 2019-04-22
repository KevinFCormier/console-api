/** *****************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018, 2019. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 ****************************************************************************** */

import supertest from 'supertest';
import server, { GRAPHQL_PATH } from '../index';

describe('Search Resolver', () => {
  test('Correctly Resolves Search Query', (done) => {
    supertest(server)
      .post(GRAPHQL_PATH)
      .send({
        query: `
          {
            searchResult: search(input: {keywords: [],
                filters: [ { property: "cluster", values: ["cluster1"]}]}){
              items
              related {
                kind
                count
                items
              }
              count
            }
          }
      `,
      })
      .end((err, res) => {
        expect(JSON.parse(res.text)).toMatchSnapshot();
        done();
      });
  });
});

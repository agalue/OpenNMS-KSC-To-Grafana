/**
 * @author Alejandro Galue <agalue@opennms.org>
 */

'use strict';

const app = require('./ksc2grafana');

const mib2HcBits_graph = {
  name: 'mib2.HCbits',
  title: 'Bits In/Out (High Speed)',
  columns: [ 'ifHCInOctets', 'ifHCOutOctets' ],
  types: [ 'interfaceSnmp' ],
  suppress: [ 'mib2.bits' ]
};

const mib2HCbits_model = {
  title: 'Bits In/Out (High Speed)',
  verticalLabel: 'Bits per second',
  metrics: [
    {
      name: 'octIn',
      attribute: 'ifHCInOctets',
      resourceId: 'node[Office:default-gateway].interfaceSnmp[vlan_0-a8d0e5a0a490]',
      datasource: 'ifHCInOctets',
      aggregation: 'AVERAGE',
      transient: true
    },{
      name: 'octOut',
      attribute: 'ifHCOutOctets',
      resourceId: 'node[Office:default-gateway].interfaceSnmp[vlan_0-a8d0e5a0a490]',
      datasource: 'ifHCOutOctets',
      aggregation: 'AVERAGE',
      transient: true
    },{
      name: 'rawbitsIn',
      expression: '(octIn * 8)',
      transient: false
    },{
      name: 'rawbitsOut',
      expression: '(octOut * 8)',
      transient: false
    },{
      name: 'rawbitsOutNeg',
      expression: '(0 - rawbitsOut)',
      transient: false
    },{
      name: 'bytesIn',
      expression: '(( (octIn == NaN) ? 1 : 0) != 0 ? 0 : octIn)',
      transient: true
    },{
      name: 'bytesOut',
      expression: '(( (octOut == NaN) ? 1 : 0) != 0 ? 0 : octOut)',
      transient: true
    },{
      name: 'outSum',
      expression: '(bytesOut * (__diff_time / 1000))',
      transient: false
    },{
      name: 'inSum',
      expression: '(bytesIn * (__diff_time / 1000))',
      transient: false
    },{
      name: 'totSum',
      expression: '(outSum + inSum)',
      transient: false
    }
  ],
  series: [
    {
      name: undefined,
      metric: 'rawbitsIn',
      type: 'area',
      color: '#73d216'
    },{
      name: 'In',
      metric: 'rawbitsIn',
      type: 'line',
      color: '#4e9a06'
    },{
      name: undefined,
      metric: 'rawbitsOutNeg',
      type: 'area',
      color: '#729fcf'
    },{
      name: 'Out',
      metric: 'rawbitsOutNeg',
      type: 'line',
      color: '#3465a4'
    },{
      metric: 'rawbitsOut',
      type: 'hidden'
    },{
      metric: 'inSum',
      type: 'hidden'
    },{
      metric: 'outSum',
      type: 'hidden'
    },{
      metric: 'totSum',
      type: 'hidden'
    }
  ]
};

const grafana_datasources = [{
  id: 1,
  orgId: 1,
  name: 'ONMS Performance',
  type: 'opennms-helm-performance-datasource',
  typeLogoUrl: 'public/plugins/opennms-helm-performance-datasource/img/pm-ds.svg',
  access: 'proxy',
  url: 'http://localhost:8980/opennms',
  basicAuth: true
}];

// Mock Object for Backshift.Utilities.RrdGraphConverter

global.Backshift = {
  Utilities: {
    RrdGraphConverter: function(graphDef, resourceId) {
      return {
        model: mib2HCbits_model
      };
    }
  }
};

beforeEach(() => {
  app.onmsGraphTemplates = {};
  app.grafanaDataSources = [];
});

test('Testing method shouldHide', () => {
  const model = {
    series: [
      { metric: 'test1', name: 'Test 1' },
      { metric: 'test2' }
    ]
  };
  expect(app.shouldHide(model, {name: 'test1'})).toBe(false);
  expect(app.shouldHide(model, {name: 'test2'})).toBe(true);
  expect(app.shouldHide(model, {name: 'test3'})).toBe(true);
});

test('Testing method getLabel', () => {
  const model = {
    series: [
      { metric: 'test1', name: 'Test 1' },
      { metric: 'test2' }
    ]
  };
  expect(app.getLabel(model, {name: 'test1'})).toBe('Test 1');
  expect(app.getLabel(model, {name: 'test2'})).toBe('test2');
  expect(app.getLabel(model, {name: 'test3'})).toBe('test3');
});

test('Testing method createPanel', () => {
  app.grafanaDataSources = grafana_datasources;
  const graph = {
    graphtype: 'mib2.HCbits',
    resourceId: 'node[1].interfaceSnmp[eth0]',
    title: 'Main Interface'
  };
  const panel = app.createPanel(graph, 6);
  expect(panel.state.title).toBe(graph.title);

  // FIXME Validate Targets
  //console.dir(panel.state.targets);
});

test('Testing method processKscXml', async() => {
  expect.assertions(2);

  app.setOnmsRest({
    get: url => {
      if (url === '/rest/graphs/mib2.HCbits') {
        return Promise.resolve({status: 200, data: mib2HcBits_graph});
      }
      return Promise.reject();
    }
  });

  app.setGrafanaRest({
    get: url => {
      if (url === '/api/datasources') {
        return Promise.resolve({status: 200, data: grafana_datasources});
      }
      return Promise.reject();
    },
    post: (url, data) => {
      if (url === '/api/dashboards/db') {
        const rows = data.dashboard.rows;
        console.dir(rows);
        expect(rows.length).toBe(1);
        expect(rows[0].panels.length).toBe(1);
        return Promise.resolve({status: 200, data: { id: 1, uid: 1, url: '/dashboard/1' } });  
      }
      return Promise.reject();
    }
  });

  await app.processKscXml('./resources/ksc-performance-reports.xml');
});

test('Testing method processKscXml - Invalid file', async() => {
  expect.assertions(1);
  try {
    await app.processKscXml('./invalid-file.xml');
  } catch (error) {
    console.log(error.message);
    expect(error.code).toBe('ENOENT');
  }
});
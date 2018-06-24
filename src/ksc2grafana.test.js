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

const getMetric = (metricName) => {
  for (let m of mib2HCbits_model.metrics) {
    if (m.name == metricName) return m;
  }
  return undefined;
};

beforeEach(() => {
  app.onmsGraphTemplates = {};
  app.grafanaDataSources = [];
});

test('Testing method shouldHideTarget', () => {
 expect(app.shouldHideTarget(mib2HCbits_model, getMetric('rawbitsIn'))).toBe(false);
 expect(app.shouldHideTarget(mib2HCbits_model, getMetric('octIn'))).toBe(true);
});

test('Testing method getTargetLabel', () => {
  expect(app.getTargetLabel(mib2HCbits_model, getMetric('rawbitsIn'))).toBe('In');
  expect(app.getTargetLabel(mib2HCbits_model, getMetric('octIn'))).toBe('octIn');
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
  panel.state.targets.filter(t => t.type == 'attribute').forEach(t => {
    expect(t.nodeId).toBe('Office:default-gateway');
    expect(t.resourceId).toBe('interfaceSnmp[vlan_0-a8d0e5a0a490]');
  });
  const visible =   panel.state.targets.filter(t => !t.hide).length;
  expect(visible).toBe(2);
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
        expect(rows.length).toBe(1);
        expect(rows[0].panels.length).toBe(1);
        return Promise.resolve({status: 200, data: { id: 1, uid: 1, url: '/dashboard/1' } });  
      }
      return Promise.reject();
    }
  });

  await app.processKscXml('./resources/ksc-performance-reports.xml');
});

test('Testing method processKscXml - unexisting file', async() => {
  expect.assertions(2);
  try {
    await app.processKscXml('./unexisting-file.xml');
  } catch (error) {
    expect(error).toBeDefined();
    expect(error.code).toBe('ENOENT');
  }
});

test('Testing method processKscXml - invalid file', async() => {
  expect.assertions(2);
  // Valid XML, but non valid KSC Configuration file.
  try {
    await app.processKscXml('./resources/invalid-file-1.xml');
  } catch (error) {
    expect(error.message).toBe('The provided XML is not a KSC Configuration XML file.');
  }
  // Invalid XML (testing xml2js errors)
  try {
    await app.processKscXml('./resources/invalid-file-2.xml');
  } catch (error) {
    expect(error.message).toMatch(/Unexpected close tag/);
  }
});

test('Testing method processKscXml - No Grafana Server', async() => {
  expect.assertions(2);

  app.setGrafanaRest({
    get: () => {
      return Promise.reject({status: 500, message: 'Grafana server not found'});
    }
  });

  try {
    await app.processKscXml('./resources/ksc-performance-reports.xml');
  } catch (error) {
    expect(error).toBeDefined();
    expect(error.message).toBe('Grafana server not found');
  }
});

test('Testing method processKscXml - No OpenNMS Server', async() => {
  expect.assertions(2);

  app.setGrafanaRest({
    get: url => {
      if (url === '/api/datasources') {
        return Promise.resolve({status: 200, data: grafana_datasources});
      }
      return Promise.reject();
    }
  });

  app.setOnmsRest({
    get: () => {
      return Promise.reject({status: 500, message: 'OpenNMS server not found'});
    }
  });

  try {
    await app.processKscXml('./resources/ksc-performance-reports.xml');
  } catch (error) {
    expect(error).toBeDefined();
    expect(error.message).toBe('OpenNMS server not found');
  }
});

/**
 * @author Alejandro Galue <agalue@opennms.org>
 */

'use strict';

const fs      = require('fs');
const vm      = require('vm');
const xml2js  = require('node-xml2js-promise');
const grafana = require('grafana-dash-gen');

// The following is the only way to instantiate Backshift classes within NodeJS
// The path is relative to the project directory; or, process.cwd()

vm.runInThisContext(fs.readFileSync('./node_modules/backshift/dist/backshift.onms.js'));

// Global Variables

let onmsRest = undefined;
let grafanaRest = undefined;
let onmsGraphTemplates = {};
let grafanaDataSources = [];

/**
 * Processes KSC Configuration XML.
 * 
 * @param {string} configFile XML config file name
 * @returns {Promise} A promise
 */
 async function processKscXml(configFile) {
  const xml = await fs.readFileSync(configFile);
  const ksc = await xml2js(xml);
  if (!ksc['ReportsList']) throw new Error('The provided XML is not a KSC Configuration XML file.');
  return processKscConfiguration(ksc);
}

/**
 * Processes KSC Configuration object.
 * 
 * @param {object} ksc The KSC configuration object
 * @returns {Promise} A promise
 */
async function processKscConfiguration(ksc) {
  // Asynchronously initialize global variable with the Grafana data sources 
  grafanaDataSources = await fetchDataSources();
  if (getOnmsPerformanceDataSource() === null) throw new Error('There is no Helm performance data source. Please configure one in Grafana');

  if (ksc.ReportsList.Report) {
    // Asynchronously initialize global variable with the OpenNMS graph templates used by the reports
    onmsGraphTemplates = await fetchGraphTemplates(ksc);

    // Processing each KSC report
    for (let report of ksc.ReportsList.Report) {
      const dashboard = createDashboard(report);
      await saveDashboard(dashboard);
    }
  } else {
    console.warn('WARN: There are no reports on the configuration file.');
  }
}

/**
 * Fetches the Grafana Data Sources asynchronously.
 * 
 * @returns {Promise} A promise with the list of data sources
 */
async function fetchDataSources() {
  const response = await grafanaRest.get('/api/datasources');
  return response.status === 200 ? response.data : [];
}

/**
 * Fetches the OpenNMS graph template asynchronously.
 * 
 * @param {string} graph The OpenNMS graph template ID
 * @returns {Promise} A promise with the HTTP response object
 */
async function fetchGraph(graph) {
  console.log(`Getting template for ${graph}...`);
  return onmsRest.get(`/rest/graphs/${graph}`);
}

/**
 * Fetches all the OpenNMS graph template asynchronously.
 * Creates a map where the key is the graph template name, and the value is the graph template object.
 * 
 * @param {object} ksc The KSC configuration object 
 * @returns {Promise} A promise with the map of templates
 */
async function fetchGraphTemplates(ksc) {
  let graphs = new Set();
  ksc.ReportsList.Report.forEach(r => r.Graph.forEach(g => graphs.add(g['$'].graphtype)));
  let promises  = [];
  graphs.forEach(g => promises.push(fetchGraph(g)));
  let responses = await Promise.all(promises);
  var templates = {};
  responses.forEach(r => templates[r.data.name] = r.data);
  return templates;
}

/**
 * Saves the Grafana Dashboard asynchronously.
 * 
 * @param {object} dashboard The Grafana dashboard object
 */
async function saveDashboard(dashboard) {
  const request = {
    dashboard,
    folderId: 0,
    override: true
  };
  console.log('Saving dashboard...');
  const response = await grafanaRest.post('/api/dashboards/db', request);
  if (response.status === 200 && response.data) {
    const data = response.data;
    console.log(`Dashboard created; id=${data.id}, uid=${data.uid}, url=${data.url}`);
  }
}

/**
 * Creates a Grafana Dashboard object for a given KSC report
 * 
 * @param {object} report The KSC report object
 * @returns {object} The Grafana dashboard object
 */
function createDashboard(report) {
  const title = report['$'].title;
  console.log(`Creating dashboard for report ${title}...`);
  var graphsPerLine = parseInt(report['$'].graphs_per_line);
  if (graphsPerLine === 0) graphsPerLine++;
  var totalRows = Math.ceil(report.Graph.length / graphsPerLine);
  var dashboard = new grafana.Dashboard({ title });
  var graphNum = 0;
  for (var r=0; r<totalRows; r++) {
    var row = new grafana.Row({ title: `KSC Row ${r}`, showTitle: false });
    for (var i=0; i<graphsPerLine; i++) {
      if (graphNum < report.Graph.length) {
        const panel = createPanel(report.Graph[graphNum]['$'], Math.floor(12/graphsPerLine));
        row.addPanel(panel);
        graphNum++;
      }
    }
    dashboard.addRow(row);
  }
  return dashboard.generate();
}

/**
 * Returns the Grafana data source name for the OpenNMS Helm performance DS.
 * It depends on `grafanaDataSources`.
 * 
 * @returns {string} The name of the Helm performance DS if exist.
 */
function getOnmsPerformanceDataSource() {
  for (let ds of grafanaDataSources) {
    if (ds.type === 'opennms-helm-performance-datasource') return ds.name;
  }
  return null;
}

/**
 * Creates a Grafana Panel.
 * TODO Set colors based on model.series.
 * TODO Set Y-Axis Label based on model.verticalLabel.
 * 
 * @param {object} row The Grafana Row object to include the Graph Panel
 * @param {object} graph The KSC Graph object
 * @param {number} span The amount of columns to expand (12 is the maximum) 
 * @returns {object} The Grafana Panel object
 */
function createPanel(graph, span) {
  var rrdGraphConverter = new Backshift.Utilities.RrdGraphConverter({
    graphDef: onmsGraphTemplates[graph.graphtype],
    resourceId: graph.resourceId
  });
  var model = rrdGraphConverter.model;
  var resourceRE = /^node\[(.*)\]\.(.*)$/;
  var panel = new grafana.Panels.Graph({
    title: graph.title,
    datasource: getOnmsPerformanceDataSource(),
    legend: {
      alignAsTable: true,
      min: true,
      max: true,
      avg: true,
      values: true
    },
    span
  });
  model.metrics.forEach(metric => {
    if ('attribute' in metric) {
      var reMatch = resourceRE.exec(metric.resourceId);
      if (reMatch !== null) {
        panel.state.targets.push({
          type: 'attribute',
          label: getTargetLabel(model,metric),
          nodeId: reMatch[1],
          resourceId: reMatch[2],
          attribute: metric.attribute,
          aggregation: metric.aggregation,
          hide: shouldHideTarget(model, metric)
        });
      }
    }
    if ('expression' in metric) {
      panel.state.targets.push({
        type: 'expression',
        label: getTargetLabel(model,metric),
        expression: metric.expression,
        hide: shouldHideTarget(model, metric)
      });
    }
  });
  return panel;
}

/**
 * Analyzes a given metric based on the current model to decide if it should be shown or not.
 * 
 * @param {object} model The graph model object
 * @param {object} metric The metric object
 * @returns {boolean} true if the target should be hidden
 */
function shouldHideTarget(model, metric) {
  for (let serie of model.series) {
    if (serie.name && serie.metric == metric.name) return false;
  }
  return true;
}

/**
 * Analyzes a given metric based on the current model to choose the appropriate label to display on the legend.
 * 
 * @param {object} model The graph model object
 * @param {object} metric The metric object
 * @returns {string} The label to use for the  target
 */
function getTargetLabel(model, metric) {
  for (let serie of model.series) {
    if (serie.name && serie.metric == metric.name) return serie.name;
  }
  return metric.name;
}

/**
 * Sets the Axios Wrapper to process HTTP requests against the OpenNMS ReST API
 * 
 * @param {object} axiosWrapper The Acios wrapper object
 */
function setOnmsRest(axiosWrapper) {
  onmsRest = axiosWrapper;
}

/**
 * Sets the Axios Wrapper to process HTTP requests against the Grafana ReST API
 * 
 * @param {object} axiosWrapper The Acios wrapper object
 */
function setGrafanaRest(axiosWrapper) {
  grafanaRest = axiosWrapper;
}

/**
 * Export methods and variables
 */
module.exports = {
  // Global Variables
  onmsGraphTemplates,
  grafanaDataSources,
  // Global Methods
  processKscXml,
  createDashboard,
  createPanel,
  shouldHideTarget,
  getTargetLabel,
  setOnmsRest,
  setGrafanaRest
};
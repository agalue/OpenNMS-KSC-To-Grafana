#!/usr/bin/env node

/* @author Alejandro Galue <agalue@opennms.org> */

'use strict';

const pkg     = require('./package.json');
const fs      = require('fs');
const vm      = require('vm');
const xml2js  = require('xml2js');
const axios   = require('axios');
const cli     = require('commander');
const grafana = require('grafana-dash-gen');

// The following is the only way to instantiate Backshift classes within NodeJS

vm.runInThisContext(fs.readFileSync('./node_modules/backshift/dist/backshift.onms.js'));

// Global Variables

let onmsRest = undefined;
let grafanaRest = undefined;
let onmsGraphTemplates = {};
let grafanaDataSources = {};

cli.version(pkg.version)
   .arguments('<ksc_reports_config_file>')
   .description('Convert OpenNMS KSC Reports to Grafana Dashboards')
   .option('-h, --onms_url <onms_url>','OpenNMS IP or Hostname', 'http://localhost:8980/opennms')
   .option('-u, --onms_user <onms_user>','OpenNMS ReST API user name', 'admin')
   .option('-p, --onms_passwd <onms_passwd>','OpenNMS ReST API user password', 'admin')
   .option('-H, --grafana_url <grafana_url>','Grafana IP or Hostname', 'http://localhost:3000')
   .option('-U, --grafana_user <grafana_user>','Grafana ReST API user name', 'admin')
   .option('-P, --grafana_passwd <grafana_passwd>','Grafana ReST API user password', 'admin')
   .action(main)
   .parse(process.argv);

if (!cli.args.length) {
  cli.help();
  exit;
}

/**
 * Main method
 * 
 * @param {string} configFile The KSC Report configuration file name
 * @param {object} cmd The commander object
 */
function main (configFile, cmd) {

  // Initializing global Axios wrapper for the OpenNMS ReST API
  onmsRest = axios.create({
    baseURL: cmd.onms_url,
    auth: {
      username: cmd.onms_user,
      password: cmd.onms_passwd
    }
  });

  // Initializing global Axios wrapper for the Grafana ReST API
  grafanaRest = axios.create({
    baseURL: cmd.grafana_url,
    auth: {
      username: cmd.grafana_user,
      password: cmd.grafana_passwd
    }
  });

  // Processing KSC Configuration XML
  fs.readFile(configFile, (err, data) => {
    if (err) {
      console.error('ERROR: Cannot read config file because...');
      console.error(err.message);
    } else {
      const parser = new xml2js.Parser();
      parser.parseString(data, async(err, ksc) => {
        if (err) {
          console.error('ERROR: Cannot parse KSC Configuration XML because...');
          console.error(err.message);
          return;
        } else {
          await processKscConfiguration(ksc);
        }
      });
    }
  });
}

/**
 * Processes KSC Configuration.
 * 
 * @param {object} ksc 
 */
async function processKscConfiguration(ksc) {
  // Asynchronously initialize global variable with the Grafana data sources 
  try {
    grafanaDataSources = await fetchDataSources();
    if (getOnmsPerformanceDataSource() === null) throw 'There is no Helm performance data source.';
  } catch (error) {
    console.error('ERROR: cannot retrieve data sources from Grafana because...');
    console.error(error.message);
    return;
  }

  if (ksc.ReportsList.Report) {
    // Asynchronously initialize global variable with the OpenNMS graph templates used by the reports
    try {
      onmsGraphTemplates = await fetchGraphTemplates(ksc);
    } catch (error) {
      console.error('ERROR: Cannot retrieve graph template because...');
      console.error(error.message);
      return;
    }

    // Processing each KSC report
    try {
      ksc.ReportsList.Report.forEach(r => processReport(r));  
    } catch (error) {
      console.error('ERROR: Cannot process reports because...');
      console.error(error.message);
      return;
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
  console.log(`Getting template for ${graph}`);
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
  try {
    const response = await grafanaRest.post('/api/dashboards/db', request);
    if (response.status === 200) {
      const data = response.data;
      console.log(`Dashboard created; id=${data.id}, uid=${data.uid}, url=${data.url}`);
    }
  } catch (error) {
    console.error('ERROR: cannot save grafana dashboard because...');
    console.error(error.response.data.message);
  }
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

// * Generate a JSON representation of the Grafana Dashboard for each KSC report
// * Save the dashboard to Grafana

/**
 * Generates and save a Grafana Dashboard object for a given KSC report
 * 
 * @param {object} report The KSC report object
 */
function processReport(report) {
  const title = report['$'].title;
  console.log(`Creating dashboard for report ${title}...`);
  var graphsPerLine = parseInt(report['$'].graphs_per_line);
  if (graphsPerLine === 0) graphsPerLine++;
  var totalRows = Math.ceil(report.Graph.length / graphsPerLine);
  var dashboard = new grafana.Dashboard({ title });
  var graphNum = 0;
  for (var r=0; r<=totalRows; r++) {
    var row = new grafana.Row({ showTitle: false });
    for (var i=0; i<graphsPerLine; i++) {
      if (graphNum < report.Graph.length) {
        addPanel(row, report.Graph[graphNum]['$'], Math.floor(12/graphsPerLine));
        graphNum++;
      }
    }
    dashboard.addRow(row);
  }
  saveDashboard(dashboard.generate());
}

/**
 * Adds a Grafana Panel to a given Row.
 * TODO Set colors based on model.series.
 * TODO Set Y-Axis Label based on model.verticalLabel.
 * 
 * @param {object} row The Grafana Row object to include the Graph Panel
 * @param {object} graph The KSC Graph object
 * @param {number} span The amount of columns to expand (12 is the maximum) 
 */
function addPanel(row, graph, span) {
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
          label: getLabel(model,metric),
          nodeId: reMatch[1],
          resourceId: reMatch[2],
          attribute: metric.attribute,
          aggregation: metric.aggregation,
          hide: shouldHide(model, metric)
        });
      }
    }
    if ('expression' in metric) {
      panel.state.targets.push({
        type: 'expression',
        label: getLabel(model,metric),
        expression: metric.expression,
        hide: shouldHide(model, metric)
      });
    }
  });
  row.addPanel(panel);
}

/**
 * Analyzes a given metric based on the current model to decide if it should be shown or not.
 * 
 * @param {object} model The graph model object
 * @param {object} metric The metric object
 * @returns {boolean} true if the metric should be hidden
 */
function shouldHide(model, metric) {
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
 * @returns {string} The label to use for the current metric
 */
function getLabel(model, metric) {
  for (let serie of model.series) {
    if (serie.metric == metric.name && serie.name) return serie.name;
	}
	return metric.name;
}

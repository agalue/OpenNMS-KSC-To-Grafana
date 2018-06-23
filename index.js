#!/usr/bin/env node

/**
 * @author Alejandro Galue <agalue@opennms.org>
 */

'use strict';

const ksc2grafana = require('./src/ksc2grafana');
const pkg         = require('./package.json');
const program     = require('commander');
const axios       = require('axios');

program.version(pkg.version)
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

if (!program.args.length) {
  program.help();
  exit;
}

/**
 * Main method
 * 
 * @param {string} configFile The KSC Report configuration file name
 * @param {object} cmd The commander object
 */
async function main (configFile, cmd) {

  // Initializing global Axios wrapper for the OpenNMS ReST API
  ksc2grafana.setOnmsRest(axios.create({
    baseURL: cmd.onms_url,
    auth: {
      username: cmd.onms_user,
      password: cmd.onms_passwd
    }
  }));

  // Initializing global Axios wrapper for the Grafana ReST API
  ksc2grafana.setGrafanaRest(axios.create({
    baseURL: cmd.grafana_url,
    auth: {
      username: cmd.grafana_user,
      password: cmd.grafana_passwd
    }
  }));

  // Processing KSC Configuration XML
  try {
    await ksc2grafana.processKscXml(configFile);
  } catch (error) {
    console.error(`Something unexpected has happened while processing the KSC report, due to ${error.message}...`);
  }
}

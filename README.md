# OpenNMS-KSC-To-Grafana

Convert OpenNMS KSC Reports to Grafana Dashboards

## Installation

```SHELL
npm install
npm link
```

## Usage

```SHELL
$ ksc2grafana 

  Usage: ksc2grafana [options] <ksc_reports_config_file>

  Convert OpenNMS KSC Reports to Grafana Dashboards

  Options:

    -V, --version                          output the version number
    -h, --onms_url <onms_url>              OpenNMS IP or Hostname (default: http://localhost:8980/opennms)
    -u, --onms_user <onms_user>            OpenNMS ReST API user name (default: admin)
    -p, --onms_passwd <onms_passwd>        OpenNMS ReST API user password (default: admin)
    -H, --grafana_url <grafana_url>        Grafana IP or Hostname (default: http://localhost:3000)
    -U, --grafana_user <grafana_user>      Grafana ReST API user name (default: admin)
    -P, --grafana_passwd <grafana_passwd>  Grafana ReST API user password (default: admin)
    -h, --help                             output usage information
```

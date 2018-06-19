# OpenNMS-KSC-To-Grafana

Convert OpenNMS KSC Reports to Grafana Dashboards.

Tested against Grafana 4.x and 5.x; although the tool provides information about the generated dashboard on the standard output only on Grafana 5.x.

It won't generate the graphs exactly as they are displayed by RRDtool or Backshift, as Grafana works on a different way, but the resulting charts should look very similar.

## Installation

It is recommended to use [NodeJS](https://nodejs.org/en/) or greater with this project, as the code uses several ES6/ES7 features.

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

There is one mandatory argument, the full path to the KSC report configuration file `$OPENNMS_HOME/etc/ksc-performance-reports.xml`.

All the options are optional, and they have to be overriden if the script is executed outside the OpenNMS server, and when Grafana is running on a different server.

## Future enhancements

* Use the information available on the template model to add the title for the Y-Axis, the colors for the series, and the series type (line, area, etc.)

[![CircleCI](https://circleci.com/gh/agalue/OpenNMS-KSC-To-Grafana.svg?style=svg)](https://circleci.com/gh/agalue/OpenNMS-KSC-To-Grafana)

# OpenNMS-KSC-To-Grafana

Convert [OpenNMS](https://opennms.org/) KSC Reports to [Grafana](https://grafana.com/) Dashboards.

Tested against Grafana 4.x, 5.x and 6.x; although the tool provides information about the generated dashboard on the standard output only on Grafana 5.x or newer.

It won't generate the graphs exactly as they are displayed by [RRDtool](https://oss.oetiker.ch/rrdtool/) or [Backshift](https://github.com/OpenNMS/backshift), as Grafana works on a different way, but the resulting charts should look very similar.

## Installation

It is recommended to use [NodeJS](https://nodejs.org/en/) version 8 or greater with this project, as the code uses several ES6/ES7 features.

```shell
npm install
npm link
```

To run the tests:

```shell
npm test
```

## Usage

```shell
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
* Verify if there is a Dashboard with the same name, if so, show an error and exit.
* Add a flag to override the content of the Dashboard if there is one with the same name.

# prometheus-explorer

Interactively explore metrics, create shortcuts for common metrics and
reference existing visualizations.

This is not intended to replace Grafana or Prometheus' expression
browser, but to exist between them, for on-the-fly exploration and
referencing of metrics that belong to many different services or boards.

**Note:** This software is in an *alpha* state, so there will probably
be missing features, bugs and other oddities.

## Features

- ✨ quickly explore metrics interactively
- ✨ define custom metrics on-the-fly using [YAML](https://yaml.org/)

    ```yaml
    network:
      query: rate(node_network_receive_bytes_total{device="wlp3s0"}[5m])
      unit: bytes
      label: device
    ```
- ✨ define custom shortcuts for commonly used queries

    ```yaml
    variables:
      cluster: eu

    shortcuts:
    # cpu usage of pods of $service running in $cluster
    - regexp: "cpu of (.*)"
      query: rate(container_cpu_usage_seconds_total{cluster=~"${vars.cluster}.*", pod=~"${match[1]}.*", image!="", container!="POD"}[5m])
    ```
- ✨ search for metrics using regular expressions
- not implemented yet:
    - reference metrics from other boards, e.g. "http requests of this service"

## Installation

1. `git clone https://github.com/spreadshirt/prometheus-explorer`
2. run `go build .` in the cloned directory
3. run `./prometheus-explorer`
    - if you want to move it around, you'll need `board.tmpl`, `static/`
      and at least `boards/default.yml` to be next to the binary

## FAQ

- I am happy with Grafana, why do I need this?

    You don't.  If you're happy with Grafana, keep using that.  If you
    miss some of the interactive features mentioned here, you maybe
    you'll find them useful, or maybe you'll build them into Grafana.
- I am happy with Prometheus' [expression browser](https://prometheus.io/docs/visualization/browser/),
  why do I need this?

    You probably don't!  Use what fits your workflow.

## License

This project is licensed under the MIT License, with the exception of
the vendored dependencies defined in go.mod and static/deps, which are
subject to their own respective licenses.

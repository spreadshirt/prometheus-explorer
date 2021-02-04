globalErrEl = document.getElementById("error");
window.onerror = (msg, url, line) => {
  globalErrEl.textContent = `${msg} (${url}:${line})`;
};

let configEl = document.getElementById("config");
let config = {};
let shortcutsEl = document.getElementById("shortcuts");
let chartsEl = document.getElementById("charts");
let charts = {};

let crosshairCharts = [];
let crosshairChartsImages = [];
let crosshairEvent = null;
let crosshairEventChart = null;
let crosshairPlugin = {
  beforeInit: function(chart) {
    crosshairCharts.push(chart);
    crosshairChartsImages.push(null);
  },
  destroy: function(chart) {
    let i = 0;
    for (i = 0; i < crosshairCharts.length; i++) {
      if (chart.id == crosshairCharts[i].id) {
        break;
      }
    }
    crosshairCharts.splice(i, 1);
    crosshairChartsImages.splice(i, 1);
  },
  beforeEvent: function(chart, ev) {
    if (ev.type != "mousemove" && ev.type != "mouseout") {
      return;
    }
    crosshairEvent = ev;
    crosshairEventChart = chart;
  },
  afterDatasetsDraw: function(chart) {
    if (!crosshairEvent) {
      return;
    }

    if (crosshairEvent.type == "mouseout") {
      for (let i = 0; i < crosshairCharts.length; i++) {
        if (crosshairChartsImages[i] != null) {
          crosshairCharts[i].ctx.putImageData(crosshairChartsImages[i], 0, 0);
        }
      }
      return;
    }

    for (let i = 0; i < crosshairCharts.length; i++) {
      let chart = crosshairCharts[i];

      let x = crosshairEvent.x;
      if (chart.id != crosshairEventChart.id) {
        if (crosshairChartsImages[i] == null) {
          crosshairChartsImages[i] = chart.ctx.getImageData(0, 0, chart.ctx.canvas.width, chart.ctx.canvas.height);
        }
        chart.ctx.putImageData(crosshairChartsImages[i], 0, 0);

        let origLeft = crosshairEventChart.chartArea.left;
        x = chart.chartArea.left + ((crosshairEvent.x - origLeft) / (crosshairEventChart.width - origLeft)) * (chart.width - chart.chartArea.left);
      }

      // ensure crosshair does not go out of chart range
      x = Math.min(x, chart.chartArea.right);
      x = Math.max(x, chart.chartArea.left);

      // avoid anti-aliasing blur (wtf)
      x = Chart.helpers._alignPixel(chart, x, chart.width);

      chart.ctx.save()
      chart.ctx.strokeStyle = "black";
      let path = new Path2D();
      path.moveTo(x, chart.chartArea.top);
      path.lineTo(x, chart.chartArea.bottom);
      chart.ctx.stroke(path);
      chart.ctx.restore();
    }

    crosshairEvent = null;
    crosshairEventChart = null;
  },
  beforeUpdate: function(chart) {
    for (let i = 0; i < crosshairCharts.length; i++) {
      if (chart.id == crosshairCharts[i].id) {
        crosshairChartsImages[i] = null;
      }
    }
  },
  afterDraw: function(chart) {
    for (let i = 0; i < crosshairCharts.length; i++) {
      if (chart.id == crosshairCharts[i].id) {
        crosshairChartsImages[i] = null;
      }
    }
  },
};

update();
configEl.addEventListener("change", update);

window.addEventListener("keydown", (ev) => {
  if (ev.ctrlKey && ev.key == "Enter") {
    globalErrEl.textContent = "";
    update();
  }
});

function update() {
  config = jsyaml.load(configEl.value);

  // set overrides from query params
  // FIXME: potential confusion because query overrides config, even if config is more recent
  for (let [key, val] of new URL(location.href).searchParams.entries()) {
    if (key == "from" || key == "to") {
      key = "defaults." + key;
    }

    key.split(".").reduce((config, key, idx, arr) => {
      if (!config) {
        return null;
      }

      if (idx == arr.length-1) {
        config[key] = val;
        return null;
      }

      return config[key];
    }, config);
  }

  config.shortcuts = config.shortcuts || [];
  let shortcuts = jsyaml.load(shortcutsEl.value);
  for (let shortcut of shortcuts.shortcuts) {
    config.shortcuts.push(shortcut);
  }

  config.annotations = config.annotations || [];
  for (let annotation of config.annotations) {
    let defaults = config.defaults;
    let url = eval("`"+annotation.url+"`");
    fetch(new Request(url))
      .then((resp) => resp.json())
      .then((resp) => {
        annotation.data = resp.hits.hits.map((doc) => {
          let v = doc._source["@timestamp"]
          return {t: new Date(v.endsWith("Z") ? v : v+"Z")}
        })

        for (let name in Chart.instances) {
          let myChart = Chart.instances[name];
          for (let ann of annotation.data) {
            let color = annotation.color;
            if (!annotation.color) {
              Math.seedrandom(annotation.url);
              color = `hsl(${Math.floor(Math.random()*360)}, 90%, 50%)`;
            }
            myChart.options.annotation.annotations.push({
              type: "line",
              scaleID: "x-axis-0",
              mode: "vertical",
              borderColor: color,
              borderWidth: 1,
              value: ann.t.getTime(),
            });
            myChart.update();
          }
        }
      })
     .catch((err) => { throw err });
  }

  for (let key in config) {
    if (key == "defaults" || key == "annotations" || key == "variables" || key == "shortcuts") {
      continue;
    }

    if (!(key in charts)) {
      createChart(key, config[key], config);
    } else {
      charts[key].render(key, config[key], config);
    }
  }

  for (let name in charts) {
    if (!(name in config)) {
      charts[name].chart.destroy();
      chartsEl.removeChild(charts[name].element);
      delete charts[name];
    }
  }
}

// TODO: support refreshing automatically
/*window.setInterval(function() {
    for (chart of charts) {
      chart.render();
    }
  }, 10 * 1000);*/

function createChart(name, config, global) {
  let chartEl = document.createElement("article");
  chartEl.classList.add("chart");
  let titleEl = document.createElement("h1");
  titleEl.textContent = name;
  chartEl.appendChild(titleEl);
  let canvasEl = document.createElement("canvas");
  canvasEl.width = 800;
  canvasEl.height = 400;
  let containerEl = document.createElement("div");
  containerEl.classList.add("chart-container");
  containerEl.appendChild(canvasEl);
  chartEl.appendChild(containerEl);
  let durEl = document.createElement("span");
  durEl.classList.add("duration");
  chartEl.appendChild(durEl);
  chartEl.appendChild(document.createTextNode(" "));
  let errEl = document.createElement("span");
  errEl.classList.add("error");
  chartEl.appendChild(errEl);
  let generatedQueryEl = document.createElement("input");
  generatedQueryEl.style.display = "none";
  generatedQueryEl.disabled = "disabled";
  chartEl.appendChild(generatedQueryEl);

  chartsEl.appendChild(chartEl);

  // ported from https://github.com/spreadshirt/es-stream-logs/blob/7f320ff3d5d9abb454e69faba041e6a7f107710e/es-stream-logs.py#L201-L216
  let parseOffset = (offset) => {
    if (typeof offset == "number") {
      return offset;
    }
    let suffix = offset[offset.length-1];
    let num = Number.parseInt(offset.substr(0, offset.length-1));
    switch (suffix) {
    case "s":
      return num;
    case "m":
      return num * 60;
    case "h":
      return num * 60 * 60;
    case "d":
      return num * 24 * 60 * 60;
    default:
      throw `could not parse offset ${offset}`;
    }
  }

  let toDate = (d) => {
    if (d instanceof Date) {
      return d;
    }
    if (d == "now") {
      return new Date();
    }
    if (d.startsWith("now-")) {
      return new Date((new Date().getTime()) - parseOffset(d.substr(4, d.length))*1000);
    }
    return new Date(d);
  }

  let numLabels = 0;
  var ctx = canvasEl.getContext("2d");
  var myChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [],
    },
    options: {
      scales: {
        xAxes: [{
          type: "time",
          time: {
            // TODO: always display timestamps in utc
            displayFormats: {
              second: "HH:mm:ss",
              minute: "HH:mm",
              hour: "HH:00",
              day: "YYYY-MM-DD",
              week: "YYYY-MM-DD",
              month: "YYYY-MM",
            },
          },
          ticks: {
            min: toDate(config.from || global.defaults.from),
            max: toDate(config.to || global.defaults.to),
          },
        }],
        yAxes: [{
          ticks: {
            beginAtZero: true,
            callback: function(value, index, values) {
              return formatUnit(value, config.unit);
            },
          }
        }]
      },
      legend: {
        position: "bottom",
        labels: {
          boxWidth: 10,
          fontSize: 10,
          pointStyle: true,
          filter: function(legendItem, chart) {
            if (numLabels > 10) {
              return false;
            }
            numLabels++;
            return true;
          },
        },
      },
      tooltips: {
        intersect: false,
        axis: "x",
        itemSort: function(a, b) { return b.yLabel - a.yLabel; },
        callbacks: {
          label: function(tooltipItem, data) {
            let label = data.datasets[tooltipItem.datasetIndex].label || '';
            if (label) {
              label += ': ';
            }

            let value = tooltipItem.yLabel;
            label += formatUnit(value, config.unit);
            return label;
          },
        },
      },
      // plugin configuration
      annotation: {
        annotations: [/*{
          type: "line",
          scaleID: "x-axis-0",
          mode: "vertical",
          borderColor: "black",
          borderWidth: 1,
          value: new Date(),
          label: {
            enabled: false,
            content: "Test annotation",
            position: "bottom",
          },
        }*/],
      },
      // performance optimizations (mostly no animations)
      elements: {
        line: {
          tension: 0,
        },
      },
      animation: {
        duration: 0,
      },
      hover: {
        animationDuration: 0,
      },
      responsiveAnimationDuration: 0,
    },
    plugins: [crosshairPlugin],
  });

  let chart = {
    config: config,
    chart: myChart,
    element: chartEl,
    render: (name, config, global) => render(name, config, global),
  };
  config.name = name;
  charts[name] = chart;

  render(name, config, global);

  function render(name, config, global) {
    numLabels = 0;

    generatedQueryEl.value = "";
    for (let shortcut of global.shortcuts) {
      let match = config.query.match(shortcut.regexp);
      if (match) {
        let vars = global.variables;
        config.query = eval("`"+shortcut.query+"`");
        generatedQueryEl.style.display = "block";
        generatedQueryEl.value = config.query;
        generatedQueryEl.size = config.query.length;
        config.unit = shortcut.unit;
        config.label = eval("`"+shortcut.label+"`");
      }
    }

    if (config.y_max) {
      myChart.options.scales.yAxes[0].ticks.max = config.y_max;
    } else {
      delete myChart.options.scales.yAxes[0].ticks.max;
    }

    let toDateString = (d) => {
      if (d instanceof Date) {
        return d.toISOString();
      }
      if (d == "now") {
        return new Date().toISOString();
      }
      return d;
    }

    myChart.options.scales.xAxes[0].ticks.min = toDate(config.from || global.defaults.from);
    myChart.options.scales.xAxes[0].ticks.max = toDate(config.to || global.defaults.to);

    let u = new URL(`${location.protocol}//${global.defaults.source}/api/v1/query_range`);
    u.searchParams.set("query", config.query);
    let from = toDate(config.from || global.defaults.from);
    let to = toDate(config.to || global.defaults.to);
    u.searchParams.set("start", toDateString(from));
    u.searchParams.set("end", toDateString(to));
    // step size in seconds chosen to yield 200 steps per chart
    let autoStep = Math.max(1, Math.round((to - from) / 1000 / 200));
    let step = parseOffset(config.step || global.defaults.step || autoStep);
    u.searchParams.set("step", step);
    let request = new Request(u.toString());

    let start = new Date();
    durEl.textContent = "updating...";
    errEl.textContent = "";
    fetch(request)
      .then(resp => resp.json())
      .then(resp => {
        if (resp.status != "success") {
          throw JSON.stringify(resp);
        }
        return resp;
      })
      .then(resp => {
        // reset dataset only after data has loaded (?)
        myChart.data.datasets = [];

        let maxSeries = config.max_series || global.defaults.max_series;
        if (resp.data.result.length > maxSeries) {
          errEl.textContent = `too many metrics, displaying only first ${maxSeries}`;
        }
        for (metric of resp.data.result.slice(0, maxSeries)) {
          let label = JSON.stringify(metric.metric);
          if (config.label != undefined) {
            label = metric.metric[config.label] || config.label;
          }
          Math.seedrandom(JSON.stringify(metric.metric));
          if (Object.keys(metric.metric).length == 0) {
            Math.seedrandom(config.query);
          }
          let color = Math.floor(Math.random()*360);
          myChart.data.datasets.push({
            label: label,
            data: metric.values
              .map(([t, v]) => ({t: new Date(t*1000), y: (Number.parseFloat(v))}))
              .map((kv, idx, arr) => {
                if (idx+1 >= arr.length) {
                  return kv;
                }

                if (!isNaN(kv.y) && (arr[idx+1].t.getTime() - kv.t.getTime()) > step*1000) {
                  arr.splice(idx+1, 0, {t: new Date(kv.t.getTime()+1), y: NaN});
                }

                return kv;
              }),
            borderColor: `hsl(${color}, 90%, 50%)`,
            backgroundColor: `hsla(${color}, 90%, 50%, 0.3)`,
            pointRadius: 0,
            pointHoverRadius: 2,
            borderWidth: 1,
          });
        }
        myChart.update();
        durEl.textContent = (new Date() - start) + "ms";
        if (resp.data.result.length == 0) {
          errEl.textContent = "no results";
        }
      })
      .catch(err => {
        durEl.textContent = (new Date() - start) + "ms";
        errEl.textContent = err.toString();
      });
  }
}

function formatUnit(value, unit) {
  let prefix = value < 0 ? -1 : 1;
  value = Math.abs(value);
  if (unit == "seconds") {
    if (value > 60) {
      return prefix*round2(value / 60) + "h";
    }
    if (value > 1) {
      return prefix*round2(value) + "s";
    }
    return prefix*round2(value * 1000) + "ms";
  }
  if (unit == "bytes") {
    if (value > 1_000_000_000) {
      return prefix*round2(value / 1_000_000_000) + "GB";
    }
    if (value > 1_000_000) {
      return prefix*round2(value / 1_000_000) + "MB";
    }
    if (value > 1_000) {
      return prefix*round2(value / 1_000) + "KB";
    }
    return prefix*round2(value) + "B";
  }

  if (value > 1_000_000) {
    return prefix*round2(value / 1_000_000) + "M";
  }
  if (value > 1_000) {
    return prefix*round2(value / 1_000) + "K";
  }
  return prefix*round2(value);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

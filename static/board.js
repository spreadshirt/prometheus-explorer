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

        x = (crosshairEvent.x / crosshairEventChart.width) * chart.width;
      }

      chart.ctx.save()
      chart.ctx.lineWidth = "0.5px";
      chart.ctx.strokeStyle = "black";
      chart.ctx.imageSmoothingEnabled = false;
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
configEl.addEventListener("keydown", (ev) => {
  if (ev.ctrlKey && ev.key == "Enter") {
    globalErrEl.textContent = "";

    update();
    ev.preventDefault();
  }
});

function update() {
  config = jsyaml.load(configEl.value);

  config.shortcuts = config.shortcuts || [];
  let shortcuts = jsyaml.load(shortcutsEl.value);
  for (let shortcut of shortcuts.shortcuts) {
    config.shortcuts.push(shortcut);
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
}

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
          // FIXME: fix chart range to always be from...to (right now it only uses the datapoints from the dataset for min/max)
          ticks: {
            min: new Date(config.from || global.defaults.from),
            max: new Date(config.to || global.defaults.to),
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
    myChart.data.datasets = [];

    let toDateString = (d) => {
      if (d instanceof Date) {
        return d.toISOString();
      }
      if (d == "now") {
        return new Date().toISOString();
      }
      return d;
    }

    let u = new URL(`http://${global.defaults.source}/api/v1/query_range`);
    u.searchParams.set("query", config.query);
    u.searchParams.set("start", toDateString(config.from || global.defaults.from));
    u.searchParams.set("end", toDateString(config.to || global.defaults.to));
    u.searchParams.set("step", config.step || global.defaults.step);
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
            data: metric.values.map(([t, v]) => ({t: new Date(t*1000), y: (v == "NaN" ? 0 : v)})),
            borderColor: `hsl(${color}, 90%, 50%)`,
            backgroundColor: `hsla(${color}, 90%, 50%, 0.3)`,
            pointRadius: 0,
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

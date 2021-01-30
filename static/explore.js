let searchFormEl = document.getElementById("search");
let searchEl = searchFormEl.querySelector("input");
let metricNamesEl = searchFormEl.querySelector("#metric-names");
let resultsEl = searchFormEl.querySelector("pre");
let durEl = searchFormEl.querySelector(".duration");
let errEl = searchFormEl.querySelector(".error");

searchEl.onblur = (ev) => {
  resultsEl.style.display = "none";
}

searchEl.onkeydown = (ev) => {
  if (ev.key == "Escape") {
    searchEl.blur();
    return;
  }

  if (ev.key == "Enter") {
    ev.preventDefault();

    if (searchEl.value == "") {
      resultsEl.innerHTML = "";
      resultsEl.style.display = "none";
      return;
    }

    if (searchEl.value.match(/=|"|\{/)) {
      listSeries();
    } else {
      fetchMetricNames();
    }
  }
}

function listSeries() {
  let u = new URL(`http://${config.defaults.source}/api/v1/series`);
  let searchStart = new Date();
  searchStart.setHours(searchStart.getHours() - 6);
  u.searchParams.set("match[]", searchEl.value);
  u.searchParams.set("start", searchStart.toISOString());
  u.searchParams.set("end", new Date().toISOString());
  let request = new Request(u.toString());

  let start = new Date();
  durEl.textContent = "searching...";
  errEl.textContent = "";
  resultsEl.innerHTML = "";
  fetch(request)
    .then(resp => resp.json())
    .then(resp => {
      if (resp.status != "success") {
        throw JSON.stringify(resp);
      }
      return resp;
    })
    .then(resp => {
      durEl.textContent = (new Date() - start) + "ms";

      for (let metric of resp.data) {
        let resultEl = document.createElement("span");
        let nameEl = document.createElement("span");
        nameEl.classList.add("name");
        nameEl.textContent = metric.__name__;
        delete metric.__name__;
        resultEl.appendChild(nameEl);
        resultEl.appendChild(document.createTextNode(" "));
        let tagsEl = document.createElement("span");
        tagsEl.textContent = JSON.stringify(metric);
        resultEl.appendChild(tagsEl);
        resultEl.appendChild(document.createTextNode("\n"));
        resultsEl.appendChild(resultEl);

        resultsEl.style.display = "inherit";
      }

      if (resp.data.length == 0) {
        errEl.textContent = "no results";
        resultsEl.style.display = "none";
      }
    })
    .catch(err => {
      durEl.textContent = (new Date() - start) + "ms";
      errEl.textContent = err;
    });

}

function fetchMetricNames() {
  let u = new URL(`${location.protocol}//${location.host}/names`);
  u.searchParams.set("source", config.defaults.source);
  u.searchParams.set("match", searchEl.value);
  let request = new Request(u.toString());

  let start = new Date();
  durEl.textContent = "searching...";
  errEl.textContent = "";
  resultsEl.innerHTML = "";
  fetch(request)
    .then(resp => resp.json())
    .then(resp => {
      durEl.textContent = (new Date() - start) + "ms";

      for (let name of resp.data) {
        let resultEl = document.createElement("span");
        resultEl.textContent = name + "\n";
        resultsEl.appendChild(resultEl);
      }
      resultsEl.style.display = "inherit";

      if (resp.data.length == 0) {
        errEl.textContent = "no results";
        resultsEl.style.display = "none";
      }
    })
    .catch(err => {
      durEl.textContent = (new Date() - start) + "ms";
      errEl.textContent = err;
    });
}

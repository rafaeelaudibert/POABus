import MapboxLayer from "@deck.gl/mapbox/dist/esm/mapbox-layer"
import SolidPolygonLayer from "@deck.gl/layers/dist/esm/solid-polygon-layer/solid-polygon-layer"
import PathLayer from "@deck.gl/layers/dist/esm/path-layer/path-layer"
import routesJSONPath from "./data/routes.json"
import stopsJSONPath from "./data/stops.json"
import lscache from "lscache"

// TODO: Change to a custom generated one
const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1IjoiY2hlZWF1biIsImEiOiJjam9weHRuMW4xdXczM3FteTR1OGt3OWxhIn0.I9fgZVxvN_wSJb8soniwpQ"

const fetchCache = (url, timeout) => {
  const data = lscache.get(url)
  if (data) {
    return Promise.resolve(data)
  } else {
    return fetch(url)
      .then((r) => r.json())
      .then((r) => {
        lscache.set(url, r, timeout)
        return r
      })
  }
}

const CACHE_TIME = 7 * 24 * 60 // 1 week
const stopsFetch = fetchCache(stopsJSONPath, CACHE_TIME)
const routesFetch = fetchCache(routesJSONPath, CACHE_TIME)

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
const lowerLat = 1.1,
  upperLat = 1.58,
  lowerLong = 103.49,
  upperLong = 104.15
const map = new mapboxgl.Map({
  container: "map",
  style: `mapbox://styles/uberdata/cjoqbbf6l9k302sl96tyvka09`,
  boxZoom: false,
  minZoom: 8,
  renderWorldCopies: false,
  bounds: [lowerLong, lowerLat, upperLong, upperLat],
  attributionControl: false,
})

map.addControl(new mapboxgl.NavigationControl(), "bottom-right")
map.addControl(
  new mapboxgl.AttributionControl({ compact: true }),
  "bottom-left"
)

// https://davidwalsh.name/javascript-debounce-function
function debounce(func, wait, immediate) {
  var timeout
  return function () {
    var context = this,
      args = arguments
    var later = function () {
      timeout = null
      if (!immediate) func.apply(context, args)
    }
    var callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) func.apply(context, args)
  }
}

// https://gist.github.com/rosszurowski/67f04465c424a9bc0dae
function lerpColor(a, b, amount) {
  var ah = parseInt(a.replace(/#/g, ""), 16),
    ar = ah >> 16,
    ag = (ah >> 8) & 0xff,
    ab = ah & 0xff,
    bh = parseInt(b.replace(/#/g, ""), 16),
    br = bh >> 16,
    bg = (bh >> 8) & 0xff,
    bb = bh & 0xff,
    rr = ar + amount * (br - ar),
    rg = ag + amount * (bg - ag),
    rb = ab + amount * (bb - ab)

  return [rr, rg, rb]
}

const mapCanvas = map.getCanvas()

map.on("load", async () => {
  const stopsData = (await stopsFetch).sort((a, b) => a.number - b.number)
  const routesData = (await routesFetch).sort((a, b) =>
    sortServices(a.number, b.number)
  )

  const serviceStops = {}
  stopsData.forEach((stop) => {
    stop.services.forEach((service) => {
      if (!serviceStops[service]) serviceStops[service] = new Set()
      serviceStops[service].add(stop.number)
    })
  })

  const stopLayerHover = debounce((info, e) => {
    const object = info.object
    let number = object ? object.number : null
    const services = object ? object.services : null
    if (number) {
      showStop(number, services)
    } else {
      const [_, type, number] = location.hash.match(/#([^\/]+)\/([^\/]+)/i) || [
        ,
        ,
      ]
      if (type === "stops") {
        showStop(number)
      } else if (type === "services") {
        showService(number)
      } else {
        showStop(null)
      }
    }
    focusListStop(number)
  }, 100)
  const stopsLayer = new MapboxLayer({
    id: "stops",
    type: SolidPolygonLayer,
    data: stopsData,
    getPolygon: (d) => d.contour,
    extruded: true,
    getElevation: (d) => (d.faded ? 30 : d.level * 100),
    getFillColor: (d) =>
      d.highlighted
        ? [229, 238, 193]
        : d.faded
        ? [55, 83, 95, 255]
        : [55, 83, 95, 128],
    pickable: true,
    autoHighlight: true,
    highlightColor: [229, 238, 193],
    onHover: stopLayerHover,
    onClick: (info, e) => {
      if (!info.object) return
      const { number } = info.object
      location.hash = `#stops/${number}`
    },
    parameters: {
      depthTest: false,
      blend: true,
    },
  })
  map.addLayer(stopsLayer)

  const $tooltip = document.getElementById("tooltip")
  const highestLevel = routesData.reduce(
    (level, d) => (d.level > level ? d.level : level),
    1
  )

  const routesLayer = new MapboxLayer({
    id: "routes",
    type: PathLayer,
    data: routesData,
    getPath: (d) => d.path,
    opacity: 1,
    widthMinPixels: 1,
    getWidth: 10,
    getColor: (d) =>
      d.faded
        ? [0, 0, 0, 0]
        : lerpColor("#73BC84", "#E5EEC1", d.level / highestLevel),
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255],
    onHover: (info, e) => {
      if (info.object) {
        const { number } = info.object
        const { x, y } = e.offsetCenter
        $tooltip.innerHTML = `Service ${number}`
        const { offsetWidth: w } = $tooltip
        const tx = Math.min(x, mapCanvas.offsetWidth - w - 5)
        const ty = y + 16 // Under the cursor
        $tooltip.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
        $tooltip.hidden = false
      } else {
        $tooltip.hidden = true
      }
    },
    parameters: {
      depthTest: false,
      blend: true,
    },
  })
  map.addLayer(routesLayer)

  map.once("data", () => {
    requestAnimationFrame(() => {
      map.once("idle", () => {
        document.body.classList.add("ready")
      })
      const center = map.unproject([
        mapCanvas.offsetWidth / 2,
        mapCanvas.offsetHeight / 3,
      ])
      map.easeTo({
        pitch: 45,
        bearing: -10,
        center,
        duration: 2000,
        zoom: map.getZoom() + 0.1,
      })
    })
  })

  const showStop = (number, services) => {
    stopsLayer.setProps({
      data: stopsData.map((d) => {
        d.faded = number && d.number !== number
        d.highlighted = number && d.number === number
        return d
      }),
    })
    if (number) {
      if (!services)
        services = stopsData.find((d) => d.number === number).services
      routesLayer.setProps({
        data: routesData.map((d) => {
          const highlighted = services.includes(d.number)
          d.highlighted = highlighted
          d.faded = !highlighted
          return d
        }),
      })
    } else {
      routesLayer.setProps({
        data: routesData.map((d) => {
          d.highlighted = d.faded = false
          return d
        }),
      })
    }
  }

  const showService = (number) => {
    if (number) {
      const stops = serviceStops[number]
      stopsLayer.setProps({
        data: stopsData.map((d) => {
          d.faded = !stops.has(d.number)
          d.highlighted = false
          return d
        }),
      })
    } else {
      stopsLayer.setProps({
        data: stopsData.map((d) => {
          d.faded = false
          d.highlighted = false
          return d
        }),
      })
    }
    routesLayer.setProps({
      data: routesData.map((d) => {
        d.faded = number && d.number !== number
        d.highlighted = false
        return d
      }),
    })
  }

  const $panel = document.getElementById("panel")
  const routesList = routesData
    .map((r) => r.number)
    .filter((el, pos, arr) => arr.indexOf(el) === pos)
  $panel.innerHTML = `
    <button type="button" id="toggle">▼</button>
    <div id="services">
      <h2 title="${routesList.length} services">Services</h2>
      <ul>
        ${routesList
          .map(
            (number) =>
              `<li><a href="#services/${number}" class="number">${number}</a></li>`
          )
          .join("")}
      </ul>
    </div>
    <div id="stops">
      <h2>${stopsData.length} Stops</h2>
      <ul>
        ${stopsData
          .map(
            (s) =>
              `<li><a href="#stops/${s.number}"><span class="number">${s.number}</span>&nbsp;&nbsp;${s.name}</a></li>`
          )
          .join("")}
      </ul>
    </div>
  `

  $panel.querySelector("#toggle").addEventListener("click", () => {
    document.body.classList.toggle("map-expand")
    setTimeout(() => {
      map.resize()
    }, 350)
  })

  const $stops = $panel.querySelector("#stops")
  const focusListStop = (number) => {
    const el = $stops.querySelector(`a[href*="/${number}"]`)
    if (el) el.focus()
  }

  let mouseoutRAF
  $panel.addEventListener("mouseover", (e) => {
    if (e.target.tagName.toLowerCase() === "a") {
      cancelAnimationFrame(mouseoutRAF)
      const [_, type, number] = e.target.href.match(/#([^\/]+)\/([^\/]+)/i)
      if (type === "stops") {
        showStop(number)
      } else if (type === "services") {
        showService(number)
      }
    }
  })
  $panel.addEventListener("mouseout", (e) => {
    if (e.target.tagName.toLowerCase() === "a") {
      mouseoutRAF = requestAnimationFrame(() => {
        const [_, type, number] = location.hash.match(
          /#([^\/]+)\/([^\/]+)/i
        ) || [, ,]
        if (type) {
          if (type === "stops") {
            showStop(number)
          } else if (type === "services") {
            showService(number)
          }
        } else {
          const [_, type, number] = e.target.href.match(/#([^\/]+)\/([^\/]+)/i)
          if (type === "stops") {
            showStop(null)
          } else if (type === "services") {
            showService(null)
          }
        }
      })
    }
  })

  const $status = document.getElementById("status")
  const closeHTML = '<a href="#" class="close">×</a>'
  window.onhashchange = () => {
    const [_, type, number] = location.hash.match(/#([^\/]+)\/([^\/]+)/i) || [
      ,
      ,
    ]
    if (type === "stops") {
      showStop(number)
      const { name } = stopsData.find((s) => s.number === number)
      $status.hidden = false
      $status.innerHTML = `<span>Bus stop ${number}: ${name}</span> ${closeHTML}`
    } else if (type === "services") {
      showService(number)
      $status.hidden = false
      $status.innerHTML = `<span>Bus service ${number}</span> ${closeHTML}`
    } else {
      showStop(null)
      $status.hidden = true
    }
  }
  window.onhashchange()
})

import fs from "fs"
import circle from "@turf/circle"
import cliProgress from "cli-progress"
import PQueue from "p-queue"

// Queue used to rate limit our requests
// At most 5 requests at the same time, with at most 5 requests per second
const queue = new PQueue({ concurrency: 5, interval: 1000, intervalCap: 5 })

// create new progress bar
const progressBar = new cliProgress.SingleBar({
  format: "Stops data: [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}",
  barCompleteChar: "\u2588",
  barIncompleteChar: "\u2591",
  hideCursor: true,
})

// If we want routes for lotations, we can use https://www.poatransporte.com.br/php/facades/process.php?a=nc&p=%&t=l
const promiseStops = fetch("https://www.poatransporte.com.br/php/facades/process.php?a=tp&p=").then((r) => r.json())
const promiseRoutes = fetch("https://www.poatransporte.com.br/php/facades/process.php?a=nc&p=%&t=o").then((r) => r.json())

const [stops, routes] = await Promise.all([promiseStops, promiseRoutes])
console.log("Fetched stops and routes")

// Create an O(1) access to stops using their code
const stopsDict = {}
for (const stop of stops) {
  const contour = circle(
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [parseFloat(stop.longitude), parseFloat(stop.latitude)],
      },
    },
    0.015,
    { steps: 3 }
  )

  stop.contour = contour.geometry.coordinates
  stop.usedLevels = new Set()
  stopsDict[stop.codigo] = stop
}
console.log("Computed stops data")

// Create an O(1) access to routes using their id, and also fetch their value
const routesDict = {}
progressBar.start(routes.length, 0)
for (const route of routes) {
  const routeInfo = await queue.add(() =>
    fetch(
      `http://www.poatransporte.com.br/php/facades/process.php?a=il&p=${route.id}`
    ).then((r) => r.json())
  )

  const path = Object.entries(routeInfo)
    .filter((obj) => !isNaN(parseInt(obj[0])))
    .map((obj) => obj[1])
    .map(({ lat, lng }) => [lng, lat])

  route.path = path
  route.stops = new Set()
  routesDict[route.id] = route

  // Make sure to increment the progress bar
  progressBar.increment()
}

// Make sure every request was fulfilled
await queue.onIdle()
progressBar.stop()
console.log("Computed routes data")

// Fill the table of stops for every route
for (const stop of stops) {
  for (const line of stop.linhas) {
    const route = routesDict[line.idLinha]
    if (route) route.stops.add(stop.codigo)
  }
}
console.log("Filled stops table for every route")

// Fill the table of levels for every route
for (const route of routes) {
  const routeStops = Array.from(route.stops, (stopId) => stopsDict[stopId])
  for (let level = 0; !route.level; level++) {
    const hasUsedLevel = routeStops.some((stop) => stop.usedLevels.has(level))
    if (!hasUsedLevel) route.level = level
  }

  // Fill for every stop, that we used this level
  for (const stop of routeStops) {
    stop.usedLevels.add(route.level)
  }
}
console.log("Filled table of levels for every route")

// Compute every missing information to save on the file
const saveableStops = stops.map((stop) => ({
  ...stop,
  level: Math.max(...stop.usedLevels),
  usedLevels: undefined,
}))

const saveableRoutes = routes
  .filter((route) => {
    // We want to remove every route that doesn't have any stop actually using it
    // This will only be true if it is on level 0 (because no oned used it);
    // And, obviously, no route used it
    return (
      route.level !== 1 ||
      saveableStops.some((stop) =>
        stop.linhas.some(({ idLinha }) => idLinha === route.id)
      )
    )
  })
  .map((route) => ({
    ...route,
    stops: undefined,
    path: route.path.map((coordinate) => [
      ...coordinate,
      (route.level - 1) * 100,
    ]),
  }))

const levels = Object.fromEntries(
  saveableStops.map((stop) => [stop.codigo, stop.level])
)

fs.writeFileSync("data/routes.min.json", JSON.stringify(saveableRoutes))
fs.writeFileSync("data/routes.json", JSON.stringify(saveableRoutes, null, 2))
fs.writeFileSync("data/stops.min.json", JSON.stringify(saveableStops))
fs.writeFileSync("data/stops.json", JSON.stringify(saveableStops, null, 2))
fs.writeFileSync("data/levels.min.json", JSON.stringify(levels))
fs.writeFileSync("data/levels.json", JSON.stringify(levels, null, 2))
console.log("Every file was written!")

// Extra information about the files
const maxLevel = Math.max(...Object.values(levels))
console.log(`MAX LEVEL: ${maxLevel}`)

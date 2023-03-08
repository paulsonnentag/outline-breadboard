import express from "express"
import * as  turf from "@turf/turf"
import fs from "fs"
import cors from "cors"

const stations = JSON.parse(fs.readFileSync("../data/stations.json"))
import got from "got"
import gzip from "node-gzip"
import {parse} from "csv-parse"

const app = express()

app.use(cors())
app.get("/weather/averages", async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)

  if (isNaN(lat) || isNaN(lng)) {
    res.sendStatus(400)
    return
  }

  const station = getClosestStation(lat, lng)
  const normals = await getNormals(station.id)
  const distance = turf.distance([station.location.latitude, station.location.longitude], [lat, lng], {
    units: "kilometers"
  })

  res.json({
    station,
    distance,
    normals
  })
})

app.listen(3000)


const stationPointsCollection = turf.featureCollection(
  stations
    .filter(
      (station) => station.identifiers.wmo !== null && station.inventory.normals.start !== null
    )
    .map((station) => {
      return turf.point([station.location.latitude, station.location.longitude], {
        station: station
      })
    })
)

function getClosestStation(lat, long) {
  const nearestStationPoint = turf.nearestPoint(turf.point([lat, long]), stationPointsCollection)



  nearestStationPoint


  return nearestStationPoint.properties.station
}


async function getNormals(stationId) {
  try {
    const {body} = await got(`https://bulk.meteostat.net/v2/normals/${stationId}.csv.gz`, {
      responseType: "buffer",
    })

    const text = (await gzip.ungzip(body)).toString()


    const normals = await new Promise((resolve) =>
      parse(text, {
        columns: ["start", "end", "month", "tempMin", "tempMax", "totalPrecipitation", "averageWindSpeed", "averagePressure", "totalSunshine"]
      }, (err, normals) => {
        resolve(
          normals.slice(0, 12).map(({
                                      month,
                                      tempMin,
                                      tempMax,
                                      totalPrecipitation,
                                      averageWindSpeed,
                                      averagePressure,
                                      totalSunshine
                                    }) => ({
            month: parseInt(month),
            tempMin: tempMin ? parseFloat(tempMin) : undefined,
            tempMax: tempMax ? parseFloat(tempMax) : undefined,
            totalPrecipitation: totalPrecipitation ? parseFloat(totalPrecipitation) : undefined,
            averageWindSpeed: averageWindSpeed ? parseFloat(averageWindSpeed) : undefined,
            averagePressure: averagePressure ? parseFloat(averagePressure) : undefined,
            totalSunshine: averagePressure ? parseFloat(totalSunshine) / 60 : undefined
          }))
        )
      })
    )

    return normals

  } catch (err) {
    console.error(err)
    return []
  }
}
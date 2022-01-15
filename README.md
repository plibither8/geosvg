# geosvg

> 🗺 Generate SVGs or Cartesian points of a path from a GPX file or list of coordinates

Get an SVG string, the svg's `path` string or list of Cartesian coordinates mapped to the path supplied by a GPX file or an array of geographical coordinates (lat/long).

## Install

```sh
$ npm install geosvg
```

## Usage

```ts
import geosvg from "geosvg";

// Read the GPX string from a file first
const gpx = readFileSync(PATH_TO_GPX, "utf-8");
// ...or directly create a list of coordinates
const coordinates = [
  { latitude: 28.1234, longitude: 77.4567 },
  { latitude: 28.1235, longitude: 77.4568 },
  { latitude: 28.1236, longitude: 77.4569 },
];

// Get the SVG string
const svg = geosvg.fromGpx(gpx).toSvg();
const svg = geosvg.fromCoordinates(coordinates).toSvg();
//=> `<svg xmlns="..." width="..." height="..." viewBox="..."><path d="..." /></svg>`

// Get the SVG path string
const svgPath = geosvg.fromGpx(gpx).toSvgPath();
const svgPath = geosvg.fromCoordinates(coordinates).toSvgPath();
//=> { width: 1000, height: 1200, path: `M 296.072357,57.331839 C 295.681288,57.932999 294.762101...` }

// Get the cartesian points
const points = geosvg.fromGpx(gpx).toCartesianDetails();
const points = geosvg.fromCoordinates(coordinates).toCartesianDetails();
//=> { width: 1000, height: 1200, points: [{ x: 300, y: 700 }, { x: 301, y: 700.25 }, ...] }
```

### Options

#### `.toSvg(options?)`, `.toSvgPath(options?)`

```ts
{
  smooth?: boolean = true; // whether to smoothen the lines or not
  smoothing?: number = 0.2; // smoothening factor
  accuracy?: number = 0.001; // accuracy of distance measurements
  scale?: number = undefined; // max-dimensions to scale the svg too
  svg?: {
    width?: number = undefined; // width of the svg, ideally leave it undefined
    height?: number = undefined; // height of the svg, ideally leave it undefined
    stroke?: string = "red"; // stroke color of the svg
    strokeWidth?: number = 4; // stroke with of the svg
    strokeLinecap?: string = "round"; // stroke's line-cap style
    strokeMiterlimit?: number = 4; // stroke's Miter limit
    fill?: string = "none"; // whether to fill in the path with a color
  };
}
```

#### `.toCartesianDetails(options?)`

```ts
{
  accuracy?: number = 0.001; // accuracy of distance measurements
}
```

## License

[MIT](LICENSE)

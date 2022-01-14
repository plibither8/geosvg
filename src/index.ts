import { readFile, writeFile } from "fs/promises";
import path from "path";
import { xml2js } from "xml-js";
import { getBounds, getDistance, getDistanceFromLine } from "geolib";

type BoundingCoordinates = [Coordinates, Coordinates, Coordinates, Coordinates];

type Line = [Coordinates, Coordinates];

interface XmlValue {
  _text: string;
}

interface Bounds {
  maxLat: number;
  minLat: number;
  maxLng: number;
  minLng: number;
}

interface CartesianPoint {
  x: number;
  y: number;
}

export interface GpxTrackPoint {
  _attributes: {
    lat: string;
    lon: string;
  };
  ele?: XmlValue;
  time?: XmlValue;
  extensions?: Record<string, any>;
}

export interface Gpx {
  gpx: {
    metadata: { time: XmlValue };
    trk: {
      name: XmlValue;
      type: XmlValue;
      trkseg: {
        trkpt: GpxTrackPoint[];
      };
    };
  };
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GenerateSvgOptions {
  smooth?: boolean;
}

const line = (
  pointA: CartesianPoint,
  pointB: CartesianPoint
): {
  length: number;
  angle: number;
} => {
  const lengthX = pointB.x - pointA.x;
  const lengthY = pointB.y - pointA.y;
  return {
    length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)),
    angle: Math.atan2(lengthY, lengthX),
  };
};

const controlPoint = (
  current: CartesianPoint,
  previous: CartesianPoint,
  next: CartesianPoint,
  reverse?: boolean
): CartesianPoint => {
  const p = previous || current;
  const n = next || current;
  const smoothing = 0.2;
  const o = line(p, n);
  const angle = o.angle + (reverse ? Math.PI : 0);
  const length = o.length * smoothing;
  const x = current.x + Math.cos(angle) * length;
  const y = current.y + Math.sin(angle) * length;
  return { x, y };
};

const bezier = (
  point: CartesianPoint,
  index: number,
  points: CartesianPoint[]
) => {
  const { x: cpsX, y: cpsY } = controlPoint(
    points[index - 1],
    points[index - 2],
    point
  );
  const { x: cpeX, y: cpeY } = controlPoint(
    point,
    points[index - 1],
    points[index + 1],
    true
  );
  return `C ${cpsX},${cpsY} ${cpeX},${cpeY} ${point.x},${point.y}`;
};

const getSvgPath = (points: CartesianPoint[], smooth?: boolean) =>
  points.reduce(
    (acc, point, index, array) =>
      index === 0
        ? `M ${point.x},${point.y}`
        : `${acc} ${
            smooth ? bezier(point, index, array) : `L ${point.x},${point.y}`
          }`,
    ""
  );

const getSvg = (
  width: number,
  height: number,
  path: string,
  options?: {}
): string =>
  `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <path d="${path}" fill="none" stroke="red" stroke-width="4" stroke-linecap="round" stroke-miterlimit="4"/>
    </svg>
  `.trim();

const getBoundingCoordinates = (bounds: Bounds): BoundingCoordinates => [
  {
    latitude: bounds.maxLat,
    longitude: bounds.minLng,
  },
  {
    latitude: bounds.maxLat,
    longitude: bounds.maxLng,
  },
  {
    latitude: bounds.minLat,
    longitude: bounds.maxLng,
  },
  {
    latitude: bounds.minLat,
    longitude: bounds.minLng,
  },
];

const getCartesianPoint = (
  point: Coordinates,
  xAxis: Line,
  yAxis: Line
): CartesianPoint => {
  const x = getDistanceFromLine(point, ...yAxis, 0.001);
  const y = getDistanceFromLine(point, ...xAxis, 0.001);
  return { x, y };
};

export function generateSvgFromGpx(gpx: string, options?: GenerateSvgOptions) {
  const parsedGpx = xml2js(gpx, {
    compact: true,
    ignoreDeclaration: true,
  }) as Gpx;
  const points: Coordinates[] = parsedGpx.gpx.trk.trkseg.trkpt.map(
    ({ _attributes }) => ({
      latitude: Number(_attributes.lat),
      longitude: Number(_attributes.lon),
    })
  );
  return generateSvg(
    points.filter((_, index) => !(index % 3)),
    options
  );
}

export function generateSvg(
  points: Coordinates[],
  options?: GenerateSvgOptions
): string {
  const bounds = getBounds(points) as Bounds;
  const boundingCoordinates = getBoundingCoordinates(bounds);
  const xAxis: Line = [boundingCoordinates[0], boundingCoordinates[1]];
  const yAxis: Line = [boundingCoordinates[0], boundingCoordinates[3]];
  const width = getDistance(...xAxis);
  const height = getDistance(...yAxis);
  const cartesianPoints = points.map((point) =>
    getCartesianPoint(point, xAxis, yAxis)
  );
  return getSvg(width, height, getSvgPath(cartesianPoints, options?.smooth));
}

export function generateSvgPath(
  points: Coordinates[],
  options?: GenerateSvgOptions
): string {
  const bounds = getBounds(points) as Bounds;
  const boundingCoordinates = getBoundingCoordinates(bounds);
  const xAxis: Line = [boundingCoordinates[0], boundingCoordinates[1]];
  const yAxis: Line = [boundingCoordinates[0], boundingCoordinates[3]];
  const cartesianPoints = points.map((point) =>
    getCartesianPoint(point, xAxis, yAxis)
  );
  return getSvgPath(cartesianPoints, options?.smooth);
}

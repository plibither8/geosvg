import { getBounds, getDistance, getDistanceFromLine } from "geolib";
import { xml2json } from "xml2json-light";

export interface Gpx {
  gpx: {
    trk: {
      trkseg: {
        trkpt: {
          lat: string;
          lon: string;
        }[];
      };
    };
  };
}

export interface CartesianPoint {
  x: number;
  y: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

type Line = [Coordinates, Coordinates];

interface Bounds {
  maxLat: number;
  minLat: number;
  maxLng: number;
  minLng: number;
}

export interface CartesianOptions {
  accuracy?: number;
  scale?: number;
}

export interface SvgOptions extends CartesianOptions {
  smooth?: boolean;
  smoothing?: number;
  svg?: Partial<{
    width: number;
    height: number;
    stroke: string;
    strokeWidth: number;
    strokeLinecap: string;
    strokeMiterlimit: number;
    fill: string;
  }>;
}

type RequiredOptions = Required<
  Omit<SvgOptions, "svg"> & { svg: Required<SvgOptions["svg"]> }
>;

const defaultOptions: RequiredOptions = {
  smooth: true,
  smoothing: 0.2,
  accuracy: 0.001,
  scale: undefined,
  svg: {
    width: undefined,
    height: undefined,
    stroke: "red",
    strokeWidth: 4,
    strokeLinecap: "round",
    strokeMiterlimit: 4,
    fill: "none",
  },
};

const getOptions = (supplied: SvgOptions): RequiredOptions => ({
  ...defaultOptions,
  ...supplied,
  svg: {
    ...defaultOptions.svg,
    ...supplied?.svg,
  },
});

const getSvgPath = (
  points: CartesianPoint[],
  smooth: boolean,
  smoothing: number
) => {
  const controlPoint = (
    current: CartesianPoint,
    previous?: CartesianPoint,
    next?: CartesianPoint,
    reverse?: boolean
  ): CartesianPoint => {
    previous ??= current;
    next ??= current;
    const lengthX = next.x - previous.x;
    const lengthY = next.y - previous.y;
    const angle = Math.atan2(lengthY, lengthX) + (reverse ? Math.PI : 0);
    const length =
      Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)) * smoothing;
    return {
      x: current.x + Math.cos(angle) * length,
      y: current.y + Math.sin(angle) * length,
    };
  };
  const curved = (point: CartesianPoint, index: number) => {
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
  const straight = (point: CartesianPoint) => `L ${point.x},${point.y}`;
  return points.reduce(
    (acc, point, index) =>
      index === 0
        ? `M ${point.x},${point.y}`
        : `${acc} ${smooth ? curved(point, index) : straight(point)}`,
    ""
  );
};

/**
 * Returns Cartesian details such as the height, width and list of the
 * Cartesian points generated from the supplied list of coordinates
 * @param points List of coordinates to generate it's Cartesian points' list
 * @param options Options to tweek the result
 * @returns Object with width and height of the Cartesian points' bounds, and the points
 */
export function generateCartesianDetails(
  points: Coordinates[],
  options?: CartesianOptions
) {
  options ??= defaultOptions;
  const bounds = getBounds(points) as Bounds;
  const corners: Record<string, Coordinates> = {
    nw: {
      latitude: bounds.maxLat,
      longitude: bounds.minLng,
    },
    ne: {
      latitude: bounds.maxLat,
      longitude: bounds.maxLng,
    },
    se: {
      latitude: bounds.minLat,
      longitude: bounds.maxLng,
    },
    sw: {
      latitude: bounds.minLat,
      longitude: bounds.minLng,
    },
  };
  const xAxis: Line = [corners.nw, corners.ne];
  const yAxis: Line = [corners.nw, corners.sw];
  const absoluteWidth = getDistance(...xAxis, options.accuracy);
  const absoluteHeight = getDistance(...yAxis, options.accuracy);
  options.scale ??= Math.max(absoluteWidth, absoluteHeight);
  const [width, height] =
    absoluteWidth > absoluteHeight
      ? [options.scale, options.scale * (absoluteHeight / absoluteWidth)]
      : [options.scale * (absoluteWidth / absoluteHeight), options.scale];
  const multiplier = width / absoluteWidth;
  const cartesianPoints: CartesianPoint[] = points.map((point) => ({
    x: getDistanceFromLine(point, ...yAxis, options.accuracy) * multiplier,
    y: getDistanceFromLine(point, ...xAxis, options.accuracy) * multiplier,
  }));
  return {
    points: cartesianPoints,
    width,
    height,
  };
}

/**
 * Returns a stringified SVG with path generated from the list of coordinates
 * @param points List of coordinates to generate it's Cartesian points' list
 * @param options Options to tweek the result
 * @returns An SVG string with the path
 */
export function generateSvg(
  points: Coordinates[],
  options?: SvgOptions
): string {
  options ??= defaultOptions;
  const {
    points: cartesianPoints,
    width,
    height,
  } = generateCartesianDetails(points, options);
  return `<svg
      xmlns="http://www.w3.org/2000/svg"
      width="${options.svg.width ?? width}"
      height="${options.svg.height ?? height}"
      viewBox="0 0 ${options.svg.width ?? width} ${
    options.svg.height ?? height
  }"
    >
      <path
        d="${getSvgPath(cartesianPoints, options.smooth, options.smoothing)}"
        fill="${options.svg.fill}"
        stroke="${options.svg.stroke}"
        stroke-width="${options.svg.strokeWidth}"
        stroke-linecap="${options.svg.strokeLinecap}"
        stroke-miterlimit="${options.svg.strokeMiterlimit}"
      />
    </svg>`.trim();
}

/**
 * Returns the string that represents the shape of the path,
 * along with its width and height
 * @param points List of coordinates to generate it's Cartesian points' list
 * @param options Options to tweek the result
 * @returns Stringified path and height and width of the SVG
 */
export function generateSvgPath(points: Coordinates[], options?: SvgOptions) {
  options ??= defaultOptions;
  const {
    points: cartesianPoints,
    width,
    height,
  } = generateCartesianDetails(points, options);
  return {
    path: getSvgPath(cartesianPoints, options.smooth, options.smoothing),
    width,
    height,
  };
}

/**
 * Supply a GPX string to get a list of chainable functions for transformation
 * @param gpx XML string of the GPX file
 * @returns Chainable functions to transform the input
 */
export function fromGpx(gpx: string) {
  const parsedGpx = xml2json(gpx) as Gpx;
  const points: Coordinates[] = parsedGpx.gpx.trk.trkseg.trkpt.map(
    ({ lat, lon }) => ({
      latitude: Number(lat),
      longitude: Number(lon),
    })
  );
  return outputs(points);
}

/**
 * Supply a list of geographical coordinates to get
 * a list of chainable functions for transformation
 * @param points Array of geographical coordinates
 * @returns Chainable functions to transform the input
 */
export function fromCoordinates(points: Coordinates[]) {
  return outputs(points);
}

const inputs = {
  fromGpx,
  fromCoordinates,
};

const outputs = (points: Coordinates[]) => ({
  toSvg: (options?: SvgOptions) => generateSvg(points, getOptions(options)),
  toSvgPath: (options?: SvgOptions) =>
    generateSvgPath(points, getOptions(options)),
  toCartesianDetails: (options?: CartesianOptions) =>
    generateCartesianDetails(points, getOptions(options)),
});

export default inputs;

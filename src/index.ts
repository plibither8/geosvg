import { getBounds, getDistance, getDistanceFromLine } from "geolib";
import { xml2js } from "xml-js";

interface XmlValue {
  _text: string;
}

interface Bounds {
  maxLat: number;
  minLat: number;
  maxLng: number;
  minLng: number;
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

export interface CartesianPoint {
  x: number;
  y: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

type Line = [Coordinates, Coordinates];

export interface CartesianOptions {
  accuracy?: number;
}

export interface SvgOptions {
  smooth?: boolean;
  smoothing?: number;
  accuracy?: number;
  maxDimension?: number;
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
  maxDimension: undefined,
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

const getSvg = (
  width: number,
  height: number,
  path: string,
  options: RequiredOptions["svg"]
): string =>
  `<svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
    >
      <path
        d="${path}"
        fill="${options.fill}"
        stroke="${options.stroke}"
        stroke-width="${options.strokeWidth}"
        stroke-linecap="${options.strokeLinecap}"
        stroke-miterlimit="${options.strokeMiterlimit}"
      />
    </svg>`.trim();

const getAxes = (
  points: Coordinates[],
  bounds?: Bounds
): {
  x: Line;
  y: Line;
} => {
  bounds ??= getBounds(points) as Bounds;
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
  return {
    x: [corners.nw, corners.ne],
    y: [corners.nw, corners.sw],
  };
};

const getCartesianPoint = (
  point: Coordinates,
  xAxis: Line,
  yAxis: Line,
  accuracy: number
): CartesianPoint => ({
  x: getDistanceFromLine(point, ...yAxis, accuracy),
  y: getDistanceFromLine(point, ...xAxis, accuracy),
});

export function generateCartesianPoints(
  points: Coordinates[],
  options?: CartesianOptions
) {
  options ??= defaultOptions;
  const { x: xAxis, y: yAxis } = getAxes(points);
  const cartesianPoints = points.map((point) =>
    getCartesianPoint(point, xAxis, yAxis, options.accuracy)
  );
  return cartesianPoints;
}

export function generateSvg(
  points: Coordinates[],
  options?: SvgOptions
): string {
  options ??= defaultOptions;
  const { x: xAxis, y: yAxis } = getAxes(points);
  const width = getDistance(...xAxis, options.accuracy);
  const height = getDistance(...yAxis, options.accuracy);
  const cartesianPoints = generateCartesianPoints(points, options);
  return getSvg(
    options.svg.width ?? width,
    options.svg.height ?? height,
    getSvgPath(cartesianPoints, options.smooth, options.smoothing),
    (options as RequiredOptions).svg
  );
}

export function generateSvgPath(
  points: Coordinates[],
  options?: SvgOptions
): string {
  options ??= defaultOptions;
  const cartesianPoints = generateCartesianPoints(points, options);
  return getSvgPath(cartesianPoints, options.smooth, options.smoothing);
}

export function fromGpx(gpx: string) {
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
  return outputs(points);
}

export function fromCoordinates(points: Coordinates[]) {
  return outputs(points);
}

const inputs = {
  fromGpx,
  fromCoordinates,
};

const outputs = (
  points: Coordinates[]
): Record<string, (options: SvgOptions) => any> => ({
  toSvg: (options?: SvgOptions) => generateSvg(points, getOptions(options)),
  toSvgPath: (options?: SvgOptions) =>
    generateSvgPath(points, getOptions(options)),
  toCartesianPoints: (options?: CartesianOptions) =>
    generateCartesianPoints(points, getOptions(options)),
});

export default inputs;

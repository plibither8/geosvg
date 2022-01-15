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

type Line = [Coordinates, Coordinates];

export interface GenerateSvgOptions {
  smooth?: boolean;
  smoothing?: number;
  accuracy?: number;
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

const defaultOptions: Required<GenerateSvgOptions> = {
  smooth: true,
  smoothing: 0.2,
  accuracy: 0.001,
  svg: {
    stroke: "red",
    strokeWidth: 4,
    strokeLinecap: "round",
    strokeMiterlimit: 4,
    fill: "none",
  },
};

const getOptions = (
  supplied: GenerateSvgOptions
): Required<GenerateSvgOptions> => ({
  ...defaultOptions,
  ...supplied,
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
  options?: GenerateSvgOptions["svg"]
): string =>
  `<svg
      xmlns="http://www.w3.org/2000/svg"
      width="${options?.width ?? width}"
      height="${options?.height ?? height}"
      viewBox="0 0 ${options?.width ?? width} ${options?.height ?? height}"
    >
      <path
        d="${path}"
        fill="${options?.fill ?? "none"}"
        stroke="${options?.stroke ?? "red"}"
        stroke-width="${options?.strokeWidth ?? "4"}"
        stroke-linecap="${options?.strokeLinecap ?? "round"}"
        stroke-miterlimit="${options?.strokeMiterlimit ?? "4"}"
      />
    </svg>`.trim();

const getAxes = (
  points: Coordinates[]
): {
  x: Line;
  y: Line;
} => {
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

export function generateSvg(
  points: Coordinates[],
  options: GenerateSvgOptions
): string {
  const { x: xAxis, y: yAxis } = getAxes(points);
  const width = getDistance(...xAxis, options.accuracy);
  const height = getDistance(...yAxis, options.accuracy);
  const cartesianPoints = points.map((point) =>
    getCartesianPoint(point, xAxis, yAxis, options.accuracy)
  );
  return getSvg(
    width,
    height,
    getSvgPath(cartesianPoints, options.smooth, options.smoothing),
    options.svg
  );
}

export function generateSvgPath(
  points: Coordinates[],
  options: GenerateSvgOptions
): string {
  const { x: xAxis, y: yAxis } = getAxes(points);
  const cartesianPoints = points.map((point) =>
    getCartesianPoint(point, xAxis, yAxis, options.accuracy)
  );
  return getSvgPath(cartesianPoints, options.smooth, options.smoothing);
}

export const inputs = {
  fromGpx,
  fromCoordinates: (points: Coordinates[]) => outputs(points),
};

const outputs = (points: Coordinates[]) => ({
  toSvg: (options?: GenerateSvgOptions) =>
    generateSvg(points, getOptions(options)),
  toSvgPath: (options?: GenerateSvgOptions) =>
    generateSvgPath(points, getOptions(options)),
});

export default inputs;

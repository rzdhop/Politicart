// The two Three.js classes the React screens use, declared by hand.
//
// three@0.128.0 ships no type declarations and @types/three for that era
// would be a new dependency pinned to a 2021 API for the sake of one card
// preview. The engine is plain JavaScript and needs none of this; only
// TracksScreen draws a spline, so only what it calls is declared here.
declare module 'three' {
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
  }
  export class CatmullRomCurve3 {
    constructor(points: Vector3[], closed?: boolean, curveType?: string, tension?: number);
    getPoints(divisions: number): Vector3[];
  }
}

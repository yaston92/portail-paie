declare module "@napi-rs/canvas/geometry.js" {
  export class DOMPoint {
    constructor(x?: number, y?: number, z?: number, w?: number);
  }
  export class DOMMatrix {
    constructor(init?: string | number[]);
  }
  export class DOMRect {
    constructor(x?: number, y?: number, width?: number, height?: number);
  }
}

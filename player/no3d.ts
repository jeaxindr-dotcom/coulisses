// A run without React Three Fiber (no 3D scene): no 3D staging, the 2D one only (player/three-stage.ts otherwise).
export const create3d = (_: { W: number; H: number; frame: () => number }): any => null;

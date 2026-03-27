import type { Color, CubeState } from '../shared/types';

/** Check if a player is allowed to offer a double */
export function canDouble(cube: CubeState, color: Color): boolean {
  if (cube.offered) return false;
  if (cube.value >= 64) return false;
  // Can double if cube is in center or owned by this player
  return cube.owner === 'center' || cube.owner === color;
}

/** Create a new cube state after a double is offered */
export function offerDouble(cube: CubeState): CubeState {
  return { ...cube, offered: true };
}

/** Create a new cube state after a double is accepted */
export function acceptDouble(cube: CubeState, acceptedBy: Color): CubeState {
  return {
    value: cube.value * 2,
    owner: acceptedBy,
    offered: false,
  };
}

/** Reset cube for a new game */
export function resetCube(): CubeState {
  return { value: 1, owner: 'center', offered: false };
}

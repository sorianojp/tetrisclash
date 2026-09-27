export const BOARD_WIDTH = 10;
export const VISIBLE_ROWS = 20;
/** Rows above the visible field where pieces spawn and garbage can push blocks. */
export const HIDDEN_ROWS = 20;
export const BOARD_HEIGHT = VISIBLE_ROWS + HIDDEN_ROWS;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** Board cell values: 0 = empty, 1-7 = piece colours, 8 = garbage. */
export type Cell = number;
export const EMPTY = 0;
export const GARBAGE = 8;

export const CELL_OF: Record<PieceType, Cell> = {
    I: 1,
    O: 2,
    T: 3,
    S: 4,
    Z: 5,
    J: 6,
    L: 7,
};

/** Rotation state: 0 = spawn, 1 = R (clockwise), 2 = 180, 3 = L. */
export type Rotation = 0 | 1 | 2 | 3;

type Point = readonly [x: number, y: number];

/** Spawn-orientation cells inside each piece's bounding box (y grows downward). */
const SPAWN_SHAPES: Record<PieceType, { size: number; cells: Point[] }> = {
    I: {
        size: 4,
        cells: [
            [0, 1],
            [1, 1],
            [2, 1],
            [3, 1],
        ],
    },
    O: {
        size: 2,
        cells: [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ],
    },
    T: {
        size: 3,
        cells: [
            [1, 0],
            [0, 1],
            [1, 1],
            [2, 1],
        ],
    },
    S: {
        size: 3,
        cells: [
            [1, 0],
            [2, 0],
            [0, 1],
            [1, 1],
        ],
    },
    Z: {
        size: 3,
        cells: [
            [0, 0],
            [1, 0],
            [1, 1],
            [2, 1],
        ],
    },
    J: {
        size: 3,
        cells: [
            [0, 0],
            [0, 1],
            [1, 1],
            [2, 1],
        ],
    },
    L: {
        size: 3,
        cells: [
            [2, 0],
            [0, 1],
            [1, 1],
            [2, 1],
        ],
    },
};

/** Pre-computed cells for every piece in every rotation. */
export const SHAPES: Record<PieceType, Point[][]> = Object.fromEntries(
    PIECE_TYPES.map((type) => {
        const { size, cells } = SPAWN_SHAPES[type];
        const rotations: Point[][] = [cells];

        for (let r = 1; r < 4; r++) {
            rotations.push(
                rotations[r - 1].map(([x, y]) => [size - 1 - y, x] as const),
            );
        }

        return [type, rotations];
    }),
) as Record<PieceType, Point[][]>;

export const SPAWN_X: Record<PieceType, number> = {
    I: 3,
    O: 4,
    T: 3,
    S: 3,
    Z: 3,
    J: 3,
    L: 3,
};

/**
 * SRS wall kick offsets, written with y pointing UP as in the guideline
 * tables. Keyed by "from>to" rotation.
 */
const KICKS_JLSTZ: Record<string, Point[]> = {
    '0>1': [
        [0, 0],
        [-1, 0],
        [-1, 1],
        [0, -2],
        [-1, -2],
    ],
    '1>0': [
        [0, 0],
        [1, 0],
        [1, -1],
        [0, 2],
        [1, 2],
    ],
    '1>2': [
        [0, 0],
        [1, 0],
        [1, -1],
        [0, 2],
        [1, 2],
    ],
    '2>1': [
        [0, 0],
        [-1, 0],
        [-1, 1],
        [0, -2],
        [-1, -2],
    ],
    '2>3': [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, -2],
        [1, -2],
    ],
    '3>2': [
        [0, 0],
        [-1, 0],
        [-1, -1],
        [0, 2],
        [-1, 2],
    ],
    '3>0': [
        [0, 0],
        [-1, 0],
        [-1, -1],
        [0, 2],
        [-1, 2],
    ],
    '0>3': [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, -2],
        [1, -2],
    ],
};

const KICKS_I: Record<string, Point[]> = {
    '0>1': [
        [0, 0],
        [-2, 0],
        [1, 0],
        [-2, -1],
        [1, 2],
    ],
    '1>0': [
        [0, 0],
        [2, 0],
        [-1, 0],
        [2, 1],
        [-1, -2],
    ],
    '1>2': [
        [0, 0],
        [-1, 0],
        [2, 0],
        [-1, 2],
        [2, -1],
    ],
    '2>1': [
        [0, 0],
        [1, 0],
        [-2, 0],
        [1, -2],
        [-2, 1],
    ],
    '2>3': [
        [0, 0],
        [2, 0],
        [-1, 0],
        [2, 1],
        [-1, -2],
    ],
    '3>2': [
        [0, 0],
        [-2, 0],
        [1, 0],
        [-2, -1],
        [1, 2],
    ],
    '3>0': [
        [0, 0],
        [1, 0],
        [-2, 0],
        [1, -2],
        [-2, 1],
    ],
    '0>3': [
        [0, 0],
        [-1, 0],
        [2, 0],
        [-1, 2],
        [2, -1],
    ],
};

/** Kick offsets converted to board coordinates (y grows downward). */
export function kicksFor(
    type: PieceType,
    from: Rotation,
    to: Rotation,
): Point[] {
    if (type === 'O') {
        return [[0, 0]];
    }

    const table = type === 'I' ? KICKS_I : KICKS_JLSTZ;

    return table[`${from}>${to}`].map(([x, y]) => [x, -y] as const);
}

/** Tetris Battle style palette, indexed by cell value. */
export const CELL_COLORS: Record<number, string> = {
    1: '#2ad4f5',
    2: '#fcd22b',
    3: '#b34ee8',
    4: '#5ad43c',
    5: '#f23a4b',
    6: '#3a6cf2',
    7: '#fa8c28',
    8: '#8a8f99',
};

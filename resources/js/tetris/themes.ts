import { CELL_COLORS } from './pieces';
import { SKIN } from './render';

/** Block colours by cell value: 1–7 are I O T S Z J L, 8 is garbage. */
type Palette = Record<number, string>;
type Skin = typeof SKIN;

/** Piece themes (App\Support\Themes::PIECES). */
export const PIECE_THEMES: Record<string, Palette> = {
    classic: {
        1: '#2ad4f5',
        2: '#fcd22b',
        3: '#b34ee8',
        4: '#5ad43c',
        5: '#f23a4b',
        6: '#3a6cf2',
        7: '#fa8c28',
        8: '#8a8f99',
    },
    pastel: {
        1: '#9be7ff',
        2: '#ffe99b',
        3: '#d9b3ff',
        4: '#b8f2a6',
        5: '#ffb3ba',
        6: '#a8c5ff',
        7: '#ffcf9e',
        8: '#a5a9b4',
    },
    neon: {
        1: '#00f0ff',
        2: '#fff700',
        3: '#ff00f0',
        4: '#39ff14',
        5: '#ff073a',
        6: '#1f51ff',
        7: '#ff9f00',
        8: '#6b6f7a',
    },
    retro: {
        1: '#c4e36b',
        2: '#9bbc0f',
        3: '#7fa35a',
        4: '#8bac0f',
        5: '#5d8a3a',
        6: '#4e7a2e',
        7: '#a9c95c',
        8: '#3f5a2a',
    },
    mono: {
        1: '#f5f5f5',
        2: '#d9d9d9',
        3: '#bfbfbf',
        4: '#e6e6e6',
        5: '#a6a6a6',
        6: '#cccccc',
        7: '#b3b3b3',
        8: '#5c5c5c',
    },
    gold: {
        1: '#ffe08a',
        2: '#ffd24d',
        3: '#f5b700',
        4: '#e6c35c',
        5: '#d4a017',
        6: '#c9a227',
        7: '#ffcc33',
        8: '#7a6a45',
    },
    cosmic: {
        1: '#7df9ff',
        2: '#f9f871',
        3: '#c77dff',
        4: '#72efdd',
        5: '#ff6bcb',
        6: '#5e60ce',
        7: '#ff9e7a',
        8: '#4a4e69',
    },
};

/** Board skins (App\Support\Themes::BOARDS). */
export const BOARD_SKINS: Record<string, Skin> = {
    midnight: {
        field: '#0d1224',
        panel: '#141a33',
        grid: 'rgba(255,255,255,0.05)',
        border: '#2c3766',
        label: '#8d9bd6',
    },
    ocean: {
        field: '#06202b',
        panel: '#0b2e3d',
        grid: 'rgba(160,230,255,0.06)',
        border: '#1f5a70',
        label: '#7cc4dc',
    },
    forest: {
        field: '#0e1a12',
        panel: '#15261a',
        grid: 'rgba(200,255,200,0.05)',
        border: '#2e5236',
        label: '#8fc79a',
    },
    sunset: {
        field: '#221021',
        panel: '#2f1630',
        grid: 'rgba(255,200,220,0.06)',
        border: '#6a2d55',
        label: '#e39ac0',
    },
    void: {
        field: '#050507',
        panel: '#0c0c10',
        grid: 'rgba(255,255,255,0.03)',
        border: '#26262e',
        label: '#8a8a99',
    },
    aurora: {
        field: '#081a1f',
        panel: '#10242e',
        grid: 'rgba(120,255,210,0.07)',
        border: '#2f6f6a',
        label: '#8ff0d0',
    },
};

/**
 * Make every board (the player's, opponents', replays and share cards) draw with
 * the viewer's chosen theme. Unknown ids fall back to the defaults.
 */
export function applyGameTheme(pieces: unknown, board: unknown): void {
    Object.assign(
        CELL_COLORS,
        PIECE_THEMES[String(pieces)] ?? PIECE_THEMES.classic,
    );
    Object.assign(SKIN, BOARD_SKINS[String(board)] ?? BOARD_SKINS.midnight);
}

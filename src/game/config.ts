import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Game } from './scenes/Game';

/**
 * Dustlight — Phaser game configuration.
 *
 * Logical resolution: 320×240 (20×16 by 15×16).
 * Single-screen rooms, pixel-art scaling, no scrolling.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 320,
    height: 240,
    pixelArt: true,
    backgroundColor: '#000000',
    parent: document.body,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 800 },
            debug: false,
        },
    },
    scene: [Boot, Game],
};

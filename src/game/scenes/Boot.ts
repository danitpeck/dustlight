import Phaser from 'phaser';

/**
 * Boot scene — loads all assets, then transitions to the Game scene.
 */
export class Boot extends Phaser.Scene {
    constructor() {
        super('Boot');
    }

    preload(): void {
        // Kenney 1-bit tileset (packed, transparent, 0px spacing)
        // 20×20 grid of 16×16 tiles = 320×320 sheet
        this.load.spritesheet('tiles', 'assets/tiles/tileset.png', {
            frameWidth: 16,
            frameHeight: 16,
            spacing: 0,
            margin: 0,
        });

        // VFX sprites
        this.load.image('slash-vfx', 'assets/sprites/curved-slash.png');
    }

    create(): void {
        this.scene.start('Game');
    }
}

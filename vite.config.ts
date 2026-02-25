import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        target: 'esnext',
        minify: 'terser',
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser'],
                },
            },
        },
    },
    server: {
        port: 8080,
        open: true,
    },
});

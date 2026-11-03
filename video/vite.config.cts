import {defineConfig} from 'vite';
import motionCanvas from '@motion-canvas/vite-plugin';
import ffmpeg from '@motion-canvas/ffmpeg';

export default defineConfig({
  plugins: [motionCanvas({project: ['./src/project.ts', './src/prime-intro.ts', './src/tutorial-series.ts', './src/advanced-tutorials.ts', './src/prime-finale.ts']}), ffmpeg()],
  server: {port: 9000},
});

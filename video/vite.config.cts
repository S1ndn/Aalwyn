import {defineConfig} from 'vite';
import motionCanvas from '@motion-canvas/vite-plugin';
import ffmpeg from '@motion-canvas/ffmpeg';

export default defineConfig({
  plugins: [motionCanvas({project: ['./src/project.ts', './src/prime-intro.ts']}), ffmpeg()],
  server: {port: 9000},
});

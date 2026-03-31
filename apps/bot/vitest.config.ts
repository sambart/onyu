import path from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@onyu/shared': path.resolve(__dirname, '../../libs/shared/src'),
      '@onyu/bot-api-client': path.resolve(__dirname, '../../libs/bot-api-client/src'),
      'src/': path.resolve(__dirname, 'src') + '/',
    },
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    server: {
      deps: {
        external: [
          '@nestjs/common',
          '@nestjs/core',
          '@nestjs/config',
          '@nestjs/axios',
          '@nestjs/event-emitter',
          '@nestjs/platform-express',
          '@discord-nestjs/core',
          '@discord-nestjs/common',
          'discord.js',
          'kazagumo',
          'shoukaku',
          'rxjs',
          'reflect-metadata',
          'class-transformer',
          'class-validator',
          'cheerio',
          'ioredis',
        ],
      },
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});

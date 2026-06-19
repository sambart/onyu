import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Database
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  // Discord
  DISCORD_API_TOKEN: Joi.string().required(),
  DISCORD_CLIENT_ID: Joi.string().required(),
  DISCORD_CLIENT_SECRET: Joi.string().required(),
  DISCORD_CALLBACK_URL: Joi.string().uri().required(),
  DISCORD_COMMAND_PREFIX: Joi.string().default('!'),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // Gemini
  GEMINI_API_KEY: Joi.string().required(),
  GEMINI_MODEL: Joi.string().default('gemini-2.5-flash'),

  // JWT
  JWT_SECRET: Joi.string().required(),

  // App
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  WEB_URL: Joi.string().default('http://localhost:4000'),

  // Data Retention
  DATA_RETENTION_DAYS: Joi.number().integer().min(7).default(90),
});

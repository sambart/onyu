import { ConfigModule, ConfigService } from '@nestjs/config';
import { type TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';

export const TypeORMConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    timezone: 'UTC',
    type: 'postgres',
    host: configService.get('DATABASE_HOST'),
    port: configService.get('DATABASE_PORT'),
    username: configService.get('DATABASE_USER'),
    password: configService.get('DATABASE_PASSWORD'),
    database: configService.get('DATABASE_NAME'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}', __dirname + '/../**/*.orm-entity{.ts,.js}'],
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: true,
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsTableName: 'migrations',
    logging: configService.get('NODE_ENV') !== 'production',
    logger: 'advanced-console',
    retryAttempts: 5,
    retryDelay: 3000,
  }),
  inject: [ConfigService],
};

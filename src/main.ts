import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { TypedConfigService } from './config/app-config.js';
import {
  API_DOCS_PATH,
  API_TITLE,
  API_VERSION,
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_MAX_AGE_SECONDS,
  HEALTH_LIVE_PATH,
  HEALTH_READY_PATH,
  IDEMPOTENT_REPLAYED_HEADER,
  REQUEST_ID_HEADER,
  RETRY_AFTER_HEADER,
} from './shared/constants/http.constants.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get<TypedConfigService>(ConfigService);
  const { port, apiPrefix, corsOrigins, bodyLimit, swaggerEnabled } =
    config.get('app', { infer: true });

  app.use(helmet());
  app.enableCors({
    origin: corsOrigins,
    methods: CORS_ALLOWED_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: [
      REQUEST_ID_HEADER,
      IDEMPOTENT_REPLAYED_HEADER,
      RETRY_AFTER_HEADER,
    ],
    maxAge: CORS_MAX_AGE_SECONDS,
  });
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  // Probes live outside the versioned API prefix so orchestrators can reach them.
  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      { path: HEALTH_LIVE_PATH, method: RequestMethod.GET },
      { path: HEALTH_READY_PATH, method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(API_TITLE)
        .setVersion(API_VERSION)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(API_DOCS_PATH, app, document);
  }

  await app.listen(port);
}

await bootstrap();

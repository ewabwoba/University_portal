import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { TypedConfigService } from '../../../config/app-config.js';
import {
  HEALTH_LIVE_PATH,
  HEALTH_READY_PATH,
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
} from '../../constants/http.constants.js';
import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from './logging.constants.js';

const QUIET_PATHS = [HEALTH_LIVE_PATH, HEALTH_READY_PATH];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) => {
        const { level, pretty } = config.get('logging', { infer: true });
        return {
          pinoHttp: {
            level,
            // Reuse a well-formed inbound id (so traces span services); otherwise mint one.
            genReqId: (req, res) => {
              const inbound = req.headers[REQUEST_ID_HEADER];
              const id =
                typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound)
                  ? inbound
                  : randomUUID();
              res.setHeader(REQUEST_ID_HEADER, id);
              return id;
            },
            redact: { paths: LOG_REDACT_PATHS, censor: LOG_REDACT_CENSOR },
            autoLogging: {
              ignore: (req) => QUIET_PATHS.some((p) => req.url?.includes(p)),
            },
            transport: pretty
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}

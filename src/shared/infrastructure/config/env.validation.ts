import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsString, validateSync } from 'class-validator';

enum NodeEnv { development = 'development', test = 'test', production = 'production' }

class EnvVars {
  @IsEnum(NodeEnv) NODE_ENV!: NodeEnv;
  @IsInt() PORT!: number;
  @IsString() DATABASE_URL!: string;
  @IsString() JWT_ACCESS_SECRET!: string;
  @IsString() JWT_REFRESH_SECRET!: string;
  @IsString() JWT_ACCESS_TTL!: string;
  @IsString() JWT_REFRESH_TTL!: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const parsed = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length) throw new Error(errors.toString());
  return parsed;
}
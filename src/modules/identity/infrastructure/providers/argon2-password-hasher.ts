import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';
import type { TypedConfigService } from '../../../../config/app-config.js';
import type { PasswordHasher } from '../../application/ports/password-hasher.port.js';

const DUMMY_SECRET_BYTES = 16;

/** argon2id. Cost parameters come from configuration; verification reads them from the stored hash. */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {}

  private get options() {
    const { argon2 } = this.config.get('security', { infer: true });
    return {
      memoryCost: argon2.memoryCostKib,
      timeCost: argon2.timeCost,
      parallelism: argon2.parallelism,
    };
  }

  hash(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  async verify(storedHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain);
    } catch {
      return false; // malformed hash: treat as a failed match, never as a crash
    }
  }

  async verifyDummy(plain: string): Promise<void> {
    this.dummyHash ??= hash(
      randomBytes(DUMMY_SECRET_BYTES).toString('hex'),
      this.options,
    );
    await this.verify(await this.dummyHash, plain);
  }
}

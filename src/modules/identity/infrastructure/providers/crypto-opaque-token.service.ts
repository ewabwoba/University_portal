import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { OpaqueTokenService } from '../../application/ports/opaque-token.service.port.js';

const TOKEN_BYTES = 32;

/** 256 bits of entropy, so a plain SHA-256 is sufficient (no need for a slow password hash). */
@Injectable()
export class CryptoOpaqueTokenService implements OpaqueTokenService {
  generate(): { raw: string; hash: string } {
    const raw = randomBytes(TOKEN_BYTES).toString('base64url');
    return { raw, hash: this.hash(raw) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}

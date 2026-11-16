import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../shared/domain/domain-error.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.js';
import type {
  UserRepository,
  UserSummary,
} from '../../domain/repositories/user.repository.js';

@Injectable()
export class GetUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(userId: string): Promise<UserSummary> {
    const user = await this.users.findSummaryById(userId);
    if (!user)
      throw new NotFoundError('User not found.', {
        code: IdentityErrorCodes.USER_NOT_FOUND,
      });
    return user;
  }
}

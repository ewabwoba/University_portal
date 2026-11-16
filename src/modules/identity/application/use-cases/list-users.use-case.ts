import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  resolvePage,
  toPaginated,
} from '../../../../shared/application/pagination.js';
import type {
  PageQuery,
  Paginated,
} from '../../../../shared/application/pagination.js';
import type { TypedConfigService } from '../../../../config/app-config.js';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.js';
import type {
  UserListFilter,
  UserRepository,
  UserSummary,
} from '../../domain/repositories/user.repository.js';

@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {}

  async execute(
    query: PageQuery & UserListFilter,
  ): Promise<Paginated<UserSummary>> {
    const page = resolvePage(
      query,
      this.config.get('pagination', { infer: true }),
    );
    const { items, total } = await this.users.findSummaries(
      { search: query.search, isActive: query.isActive },
      { skip: page.skip, limit: page.limit },
    );
    return toPaginated(items, total, page);
  }
}

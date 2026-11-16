import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** The upper bound is applied from configuration (PAGINATION_MAX_LIMIT) in `resolvePage`. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

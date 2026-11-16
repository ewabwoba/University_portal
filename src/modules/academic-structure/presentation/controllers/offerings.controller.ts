import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Idempotent } from '../../../../shared/presentation/decorators/idempotent.decorator.js';
import { RequirePermissions } from '../../../../shared/presentation/decorators/require-permissions.decorator.js';
import { OfferingService } from '../../application/services/offering.service.js';
import { AcademicPermissions as P } from '../../contracts/permissions.js';
import {
  CreateOfferingDto,
  ListOfferingsQueryDto,
  UpdateOfferingDto,
} from '../dto/academic.dto.js';

@ApiTags('Offerings')
@Controller('offerings')
export class OfferingsController {
  constructor(private readonly service: OfferingService) {}

  @RequirePermissions(P.OFFERING_MANAGE)
  @Idempotent()
  @Post()
  create(@Body() dto: CreateOfferingDto) {
    return this.service.create(dto);
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get()
  list(@Query() query: ListOfferingsQueryDto) {
    return this.service.list(query);
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @RequirePermissions(P.OFFERING_MANAGE)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfferingDto,
  ) {
    return this.service.update(id, dto);
  }
}

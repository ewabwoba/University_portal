import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Idempotent } from '../../../../shared/presentation/decorators/idempotent.decorator.js';
import { RequirePermissions } from '../../../../shared/presentation/decorators/require-permissions.decorator.js';
import { CurriculumService } from '../../application/services/curriculum.service.js';
import { AcademicPermissions as P } from '../../contracts/permissions.js';
import type { CurriculumEntry } from '../../domain/entities/curriculum-entry.entity.js';
import {
  AddCurriculumEntryDto,
  CurriculumQueryDto,
  SetPrerequisitesDto,
  UpdateCurriculumEntryDto,
} from '../dto/academic.dto.js';

const entryView = (e: CurriculumEntry) => ({
  id: e.id,
  programmeId: e.programmeId,
  unitId: e.unitId,
  curriculumVersion: e.curriculumVersion,
  studyYear: e.studyYear,
  recommendedSemester: e.recommendedSemester,
  isCompulsory: e.isCompulsory,
  prerequisiteIds: e.prerequisiteIds,
});

@ApiTags('Curriculum')
@Controller()
export class CurriculumController {
  constructor(private readonly service: CurriculumService) {}

  @RequirePermissions(P.STRUCTURE_READ)
  @Get('programmes/:programmeId/curriculum')
  view(
    @Param('programmeId', ParseUUIDPipe) programmeId: string,
    @Query() query: CurriculumQueryDto,
  ) {
    return this.service.view(programmeId, query.version);
  }

  @RequirePermissions(P.CURRICULUM_MANAGE)
  @Idempotent()
  @Post('programmes/:programmeId/curriculum')
  async add(
    @Param('programmeId', ParseUUIDPipe) programmeId: string,
    @Body() dto: AddCurriculumEntryDto,
  ) {
    return entryView(
      await this.service.addEntry({
        programmeId,
        unitId: dto.unitId,
        studyYear: dto.studyYear,
        recommendedSemester: dto.recommendedSemester,
        isCompulsory: dto.isCompulsory,
        curriculumVersion: dto.curriculumVersion,
      }),
    );
  }

  @RequirePermissions(P.CURRICULUM_MANAGE)
  @Patch('curriculum-entries/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCurriculumEntryDto,
  ) {
    return entryView(await this.service.updateEntry(id, dto));
  }

  @RequirePermissions(P.CURRICULUM_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('curriculum-entries/:id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.removeEntry(id);
  }

  @RequirePermissions(P.CURRICULUM_MANAGE)
  @Put('curriculum-entries/:id/prerequisites')
  async setPrerequisites(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPrerequisitesDto,
  ) {
    return entryView(
      await this.service.setPrerequisites(id, dto.prerequisiteIds),
    );
  }
}

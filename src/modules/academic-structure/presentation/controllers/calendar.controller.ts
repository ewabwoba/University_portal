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
import { PaginationQueryDto } from '../../../../shared/presentation/pagination/pagination-query.dto.js';
import { Idempotent } from '../../../../shared/presentation/decorators/idempotent.decorator.js';
import { RequirePermissions } from '../../../../shared/presentation/decorators/require-permissions.decorator.js';
import { CalendarService } from '../../application/services/calendar.service.js';
import { AcademicPermissions as P } from '../../contracts/permissions.js';
import type { AcademicYear } from '../../domain/entities/academic-year.entity.js';
import {
  CreateAcademicYearDto,
  CreateSemesterDto,
  UpdateAcademicYearDto,
  UpdateSemesterDto,
} from '../dto/academic.dto.js';
import { parseDateOnly, parseDateTime } from '../dto/dates.js';

const yearView = (y: AcademicYear) => ({
  id: y.id,
  name: y.name,
  startDate: y.startDate,
  endDate: y.endDate,
  semesters: y.semesters.map((s) => ({ ...s, academicYearId: y.id })),
});

@ApiTags('Calendar')
@Controller()
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @RequirePermissions(P.CALENDAR_MANAGE)
  @Idempotent()
  @Post('academic-years')
  async createYear(@Body() dto: CreateAcademicYearDto) {
    return yearView(
      await this.service.createYear({
        name: dto.name,
        startDate: parseDateOnly(dto.startDate, 'startDate'),
        endDate: parseDateOnly(dto.endDate, 'endDate'),
      }),
    );
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get('academic-years')
  async listYears(@Query() query: PaginationQueryDto) {
    const page = await this.service.listYears(query);
    return { ...page, items: page.items.map(yearView) };
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get('academic-years/current-semester')
  currentSemester() {
    return this.service.findCurrentSemester();
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get('academic-years/:id')
  async getYear(@Param('id', ParseUUIDPipe) id: string) {
    return yearView(await this.service.getYear(id));
  }

  @RequirePermissions(P.CALENDAR_MANAGE)
  @Patch('academic-years/:id')
  async updateYear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return yearView(
      await this.service.updateYear(id, {
        startDate: dto.startDate
          ? parseDateOnly(dto.startDate, 'startDate')
          : undefined,
        endDate: dto.endDate
          ? parseDateOnly(dto.endDate, 'endDate')
          : undefined,
      }),
    );
  }

  @RequirePermissions(P.CALENDAR_MANAGE)
  @Idempotent()
  @Post('academic-years/:id/semesters')
  async addSemester(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSemesterDto,
  ) {
    const { year, semester } = await this.service.addSemester(id, {
      sequence: dto.sequence,
      name: dto.name,
      startDate: parseDateOnly(dto.startDate, 'startDate'),
      endDate: parseDateOnly(dto.endDate, 'endDate'),
      registrationOpensAt: parseDateTime(
        dto.registrationOpensAt,
        'registrationOpensAt',
      ),
      registrationClosesAt: parseDateTime(
        dto.registrationClosesAt,
        'registrationClosesAt',
      ),
      addDropClosesAt: dto.addDropClosesAt
        ? parseDateTime(dto.addDropClosesAt, 'addDropClosesAt')
        : null,
    });
    return { ...semester, academicYearId: year.id };
  }

  @RequirePermissions(P.CALENDAR_MANAGE)
  @Patch('semesters/:id')
  async updateSemester(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSemesterDto,
  ) {
    const { year, semester } = await this.service.updateSemester(id, {
      name: dto.name,
      startDate: dto.startDate
        ? parseDateOnly(dto.startDate, 'startDate')
        : undefined,
      endDate: dto.endDate ? parseDateOnly(dto.endDate, 'endDate') : undefined,
      registrationOpensAt: dto.registrationOpensAt
        ? parseDateTime(dto.registrationOpensAt, 'registrationOpensAt')
        : undefined,
      registrationClosesAt: dto.registrationClosesAt
        ? parseDateTime(dto.registrationClosesAt, 'registrationClosesAt')
        : undefined,
      addDropClosesAt: dto.addDropClosesAt
        ? parseDateTime(dto.addDropClosesAt, 'addDropClosesAt')
        : undefined,
    });
    return { ...semester, academicYearId: year.id };
  }
}

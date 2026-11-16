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
import {
  CampusService,
  DepartmentService,
  FacultyService,
  ProgrammeService,
  UnitService,
} from '../../application/services/catalog.services.js';
import { AcademicPermissions as P } from '../../contracts/permissions.js';
import type {
  Campus,
  Department,
  Faculty,
  Programme,
  Unit,
} from '../../domain/entities/catalog.entities.js';
import {
  CreateCampusDto,
  CreateDepartmentDto,
  CreateFacultyDto,
  CreateProgrammeDto,
  CreateUnitDto,
  ListCampusesQueryDto,
  ListDepartmentsQueryDto,
  ListFacultiesQueryDto,
  ListProgrammesQueryDto,
  ListUnitsQueryDto,
  UpdateCampusDto,
  UpdateNamedDto,
  UpdateProgrammeDto,
  UpdateUnitDto,
} from '../dto/academic.dto.js';

const campusView = (c: Campus) => ({
  id: c.id,
  code: c.code,
  name: c.name,
  location: c.location,
  isActive: c.isActive,
});
const facultyView = (f: Faculty) => ({
  id: f.id,
  campusId: f.campusId,
  code: f.code,
  name: f.name,
  isActive: f.isActive,
});
const departmentView = (d: Department) => ({
  id: d.id,
  facultyId: d.facultyId,
  code: d.code,
  name: d.name,
  isActive: d.isActive,
});
const programmeView = (p: Programme) => ({
  id: p.id,
  departmentId: p.departmentId,
  code: p.code,
  name: p.name,
  awardType: p.awardType,
  durationYears: p.durationYears,
  currentCurriculumVersion: p.currentCurriculumVersion,
  isActive: p.isActive,
});
const unitView = (u: Unit) => ({
  id: u.id,
  code: u.code,
  name: u.name,
  creditPoints: u.creditPoints,
  isActive: u.isActive,
});
const mapPage = <T, V>(page: { items: T[] }, view: (item: T) => V) => ({
  ...page,
  items: page.items.map(view),
});

@ApiTags('Campuses')
@Controller('campuses')
export class CampusesController {
  constructor(private readonly service: CampusService) {}

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Idempotent()
  @Post()
  async create(@Body() dto: CreateCampusDto) {
    return campusView(await this.service.create(dto));
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get()
  async list(@Query() query: ListCampusesQueryDto) {
    return mapPage(await this.service.list(query), campusView);
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return campusView(await this.service.get(id));
  }

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampusDto,
  ) {
    return campusView(await this.service.update(id, dto));
  }
}

@ApiTags('Faculties')
@Controller('faculties')
export class FacultiesController {
  constructor(private readonly service: FacultyService) {}

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Idempotent()
  @Post()
  async create(@Body() dto: CreateFacultyDto) {
    return facultyView(await this.service.create(dto));
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get()
  async list(@Query() query: ListFacultiesQueryDto) {
    return mapPage(await this.service.list(query), facultyView);
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return facultyView(await this.service.get(id));
  }

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNamedDto,
  ) {
    return facultyView(await this.service.update(id, dto));
  }
}

@ApiTags('Departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentService) {}

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Idempotent()
  @Post()
  async create(@Body() dto: CreateDepartmentDto) {
    return departmentView(await this.service.create(dto));
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get()
  async list(@Query() query: ListDepartmentsQueryDto) {
    return mapPage(await this.service.list(query), departmentView);
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return departmentView(await this.service.get(id));
  }

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNamedDto,
  ) {
    return departmentView(await this.service.update(id, dto));
  }
}

@ApiTags('Programmes')
@Controller('programmes')
export class ProgrammesController {
  constructor(private readonly service: ProgrammeService) {}

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Idempotent()
  @Post()
  async create(@Body() dto: CreateProgrammeDto) {
    return programmeView(await this.service.create(dto));
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get()
  async list(@Query() query: ListProgrammesQueryDto) {
    return mapPage(await this.service.list(query), programmeView);
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return programmeView(await this.service.get(id));
  }

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgrammeDto,
  ) {
    return programmeView(await this.service.update(id, dto));
  }
}

@ApiTags('Units')
@Controller('units')
export class UnitsController {
  constructor(private readonly service: UnitService) {}

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Idempotent()
  @Post()
  async create(@Body() dto: CreateUnitDto) {
    return unitView(await this.service.create(dto));
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get()
  async list(@Query() query: ListUnitsQueryDto) {
    return mapPage(await this.service.list(query), unitView);
  }

  @RequirePermissions(P.STRUCTURE_READ)
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return unitView(await this.service.get(id));
  }

  @RequirePermissions(P.STRUCTURE_MANAGE)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return unitView(await this.service.update(id, dto));
  }
}

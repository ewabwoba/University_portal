import { Module } from '@nestjs/common';
import { ACADEMIC_CALENDAR } from './contracts/academic-calendar.port.js';
import { CURRICULUM_READER } from './contracts/curriculum-reader.port.js';
import { OFFERING_CAPACITY } from './contracts/offering-capacity.port.js';
import { CalendarService } from './application/services/calendar.service.js';
import {
  CampusService,
  DepartmentService,
  FacultyService,
  ProgrammeService,
  UnitService,
} from './application/services/catalog.services.js';
import { CurriculumService } from './application/services/curriculum.service.js';
import {
  OfferingCapacityService,
  OfferingService,
} from './application/services/offering.service.js';
import {
  CALENDAR_REPOSITORY,
  CAMPUS_REPOSITORY,
  CURRICULUM_REPOSITORY,
  DEPARTMENT_REPOSITORY,
  FACULTY_REPOSITORY,
  OFFERING_REPOSITORY,
  PROGRAMME_REPOSITORY,
  UNIT_REPOSITORY,
} from './domain/repositories/academic.repositories.js';
import { PrismaCalendarRepository } from './infrastructure/persistence/prisma-calendar.repository.js';
import {
  PrismaCampusRepository,
  PrismaDepartmentRepository,
  PrismaFacultyRepository,
  PrismaProgrammeRepository,
  PrismaUnitRepository,
} from './infrastructure/persistence/prisma-catalog.repositories.js';
import { PrismaCurriculumRepository } from './infrastructure/persistence/prisma-curriculum.repository.js';
import { PrismaOfferingRepository } from './infrastructure/persistence/prisma-offering.repository.js';
import { CalendarController } from './presentation/controllers/calendar.controller.js';
import {
  CampusesController,
  DepartmentsController,
  FacultiesController,
  ProgrammesController,
  UnitsController,
} from './presentation/controllers/catalog.controllers.js';
import { CurriculumController } from './presentation/controllers/curriculum.controller.js';
import { OfferingsController } from './presentation/controllers/offerings.controller.js';

@Module({
  controllers: [
    CampusesController,
    FacultiesController,
    DepartmentsController,
    ProgrammesController,
    UnitsController,
    CurriculumController,
    CalendarController,
    OfferingsController,
  ],
  providers: [
    CampusService,
    FacultyService,
    DepartmentService,
    ProgrammeService,
    UnitService,
    CurriculumService,
    CalendarService,
    OfferingService,
    OfferingCapacityService,
    { provide: CAMPUS_REPOSITORY, useClass: PrismaCampusRepository },
    { provide: FACULTY_REPOSITORY, useClass: PrismaFacultyRepository },
    { provide: DEPARTMENT_REPOSITORY, useClass: PrismaDepartmentRepository },
    { provide: PROGRAMME_REPOSITORY, useClass: PrismaProgrammeRepository },
    { provide: UNIT_REPOSITORY, useClass: PrismaUnitRepository },
    { provide: CURRICULUM_REPOSITORY, useClass: PrismaCurriculumRepository },
    { provide: CALENDAR_REPOSITORY, useClass: PrismaCalendarRepository },
    { provide: OFFERING_REPOSITORY, useClass: PrismaOfferingRepository },
    // The ONLY surface other modules may use.
    { provide: ACADEMIC_CALENDAR, useExisting: CalendarService },
    { provide: CURRICULUM_READER, useExisting: CurriculumService },
    { provide: OFFERING_CAPACITY, useExisting: OfferingCapacityService },
  ],
  exports: [ACADEMIC_CALENDAR, CURRICULUM_READER, OFFERING_CAPACITY],
})
export class AcademicStructureModule {}

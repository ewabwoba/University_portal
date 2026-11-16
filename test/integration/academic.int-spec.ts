import { randomUUID } from 'node:crypto';
import { ACADEMIC_CALENDAR } from '../../src/modules/academic-structure/contracts/academic-calendar.port.js';
import type { AcademicCalendar } from '../../src/modules/academic-structure/contracts/academic-calendar.port.js';
import { CURRICULUM_READER } from '../../src/modules/academic-structure/contracts/curriculum-reader.port.js';
import type { CurriculumReader } from '../../src/modules/academic-structure/contracts/curriculum-reader.port.js';
import { OFFERING_CAPACITY } from '../../src/modules/academic-structure/contracts/offering-capacity.port.js';
import type { OfferingCapacity } from '../../src/modules/academic-structure/contracts/offering-capacity.port.js';
import { OFFERING_REPOSITORY } from '../../src/modules/academic-structure/domain/repositories/academic.repositories.js';
import type { OfferingRepository } from '../../src/modules/academic-structure/domain/repositories/academic.repositories.js';
import { IdentitySeeder } from '../../src/modules/identity/infrastructure/seed/identity.seeder.js';
import { PERMISSION_CATALOG } from '../../src/seed/permission-catalog.js';
import { createTestPrisma } from '../support/database.js';
import { expectProblem, startHarness } from '../support/harness.js';
import type { Harness, TestUser } from '../support/harness.js';

const code = (prefix: string) =>
  `${prefix}${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;

describe('Academic structure (real AppModule + PostgreSQL)', () => {
  const prisma = createTestPrisma();
  let h: Harness;
  let registrar: TestUser;
  let student: TestUser;

  const create = async (
    path: string,
    body: object,
    token = registrar.token,
  ) => {
    const res = await h.post(path, token, body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body;
  };
  const patch = (path: string, body: object, token = registrar.token) =>
    h.http().patch(path).set(h.bearer(token)).send(body);
  const get = (path: string, token = registrar.token) =>
    h.http().get(path).set(h.bearer(token));
  const put = (path: string, body: object, token = registrar.token) =>
    h.http().put(path).set(h.bearer(token)).send(body);

  /** campus -> faculty -> department -> 4-year programme */
  const buildProgramme = async (durationYears = 4) => {
    const campus = await create('/campuses', {
      code: code('C'),
      name: 'Main Campus',
    });
    const faculty = await create('/faculties', {
      campusId: campus.id,
      code: code('F'),
      name: 'Faculty of Science',
    });
    const department = await create('/departments', {
      facultyId: faculty.id,
      code: code('D'),
      name: 'Computing',
    });
    const programme = await create('/programmes', {
      departmentId: department.id,
      code: code('P'),
      name: 'BSc Computer Science',
      awardType: 'BACHELORS',
      durationYears,
    });
    return { campus, faculty, department, programme };
  };
  const makeUnit = (creditPoints = 3) =>
    create('/units', { code: code('U'), name: 'A Unit', creditPoints });

  beforeAll(async () => {
    h = await startHarness(prisma);
    registrar = await h.createUser(['REGISTRAR']); // preset: every academic permission
    student = await h.createUser(['STUDENT']); // preset: read-only
  });
  afterAll(() => h.close());

  describe('hierarchy and validation', () => {
    it('builds campus -> faculty -> department -> programme -> unit, normalising codes', async () => {
      const campus = await create('/campuses', {
        code: ' main-a ',
        name: '  Main   Campus ',
        location: 'Nairobi',
      });
      expect(campus).toMatchObject({
        code: 'MAIN-A',
        name: 'Main Campus',
        location: 'Nairobi',
        isActive: true,
      });

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: campus.id, action: 'CAMPUS_CREATED' },
      });
      expect(audit).toMatchObject({ userId: registrar.id, module: 'academic' });

      const { programme } = await buildProgramme();
      expect(programme).toMatchObject({
        awardType: 'BACHELORS',
        durationYears: 4,
        currentCurriculumVersion: 1,
      });
    });

    it('enforces uniqueness at the right scope', async () => {
      const campusA = await create('/campuses', {
        code: code('C'),
        name: 'Campus A',
      });
      const campusB = await create('/campuses', {
        code: code('C'),
        name: 'Campus B',
      });
      expectProblem(
        await h.post('/campuses', registrar.token, {
          code: campusA.code,
          name: 'Dup',
        }),
        409,
        'CODE_ALREADY_EXISTS',
      );

      // A faculty code is unique per campus, so the same code is fine on another campus.
      const facultyCode = code('F');
      await create('/faculties', {
        campusId: campusA.id,
        code: facultyCode,
        name: 'Valid Name',
      });
      await create('/faculties', {
        campusId: campusB.id,
        code: facultyCode,
        name: 'Valid Name',
      });
      expectProblem(
        await h.post('/faculties', registrar.token, {
          campusId: campusA.id,
          code: facultyCode,
          name: 'Valid Name',
        }),
        409,
        'CODE_ALREADY_EXISTS',
      );

      // Programme and unit codes are global.
      const { programme, department } = await buildProgramme();
      expectProblem(
        await h.post('/programmes', registrar.token, {
          departmentId: department.id,
          code: programme.code,
          name: 'Dup',
          awardType: 'DIPLOMA',
          durationYears: 2,
        }),
        409,
        'CODE_ALREADY_EXISTS',
      );
      const unit = await makeUnit();
      expectProblem(
        await h.post('/units', registrar.token, {
          code: unit.code.toLowerCase(),
          name: 'Dup',
          creditPoints: 3,
        }),
        409,
        'CODE_ALREADY_EXISTS',
      );
    });

    it('rejects invalid input with precise errors', async () => {
      expectProblem(
        await h.post('/campuses', registrar.token, {
          code: 'bad code!',
          name: 'Valid Name',
        }),
        422,
        'CODE_INVALID',
      );
      expectProblem(
        await h.post('/units', registrar.token, {
          code: code('U'),
          name: 'Valid Name',
          creditPoints: 0,
        }),
        422,
        'VALUE_OUT_OF_RANGE',
      );
      const { department } = await buildProgramme();
      expectProblem(
        await h.post('/programmes', registrar.token, {
          departmentId: department.id,
          code: code('P'),
          name: 'Valid Name',
          awardType: 'WIZARDRY',
          durationYears: 3,
        }),
        422,
        'VALIDATION_FAILED',
      );
      expectProblem(
        await h.post('/programmes', registrar.token, {
          departmentId: department.id,
          code: code('P'),
          name: 'Valid Name',
          awardType: 'DIPLOMA',
          durationYears: 12,
        }),
        422,
        'VALUE_OUT_OF_RANGE',
      );
      expectProblem(
        await h.post('/faculties', registrar.token, {
          campusId: randomUUID(),
          code: code('F'),
          name: 'Valid Name',
        }),
        404,
        'CAMPUS_NOT_FOUND',
      );
      expectProblem(
        await h.post('/campuses', registrar.token, {
          code: code('C'),
          name: 'Valid Name',
          isAdmin: true,
        }),
        422,
        'VALIDATION_FAILED',
      );
    });

    it('will not deactivate a parent that still has active children, nor reactivate under an inactive parent', async () => {
      const { campus, faculty, department, programme } = await buildProgramme();
      expectProblem(
        await patch(`/campuses/${campus.id}`, { isActive: false }),
        409,
        'HAS_ACTIVE_CHILDREN',
      );
      expectProblem(
        await patch(`/faculties/${faculty.id}`, { isActive: false }),
        409,
        'HAS_ACTIVE_CHILDREN',
      );
      expectProblem(
        await patch(`/departments/${department.id}`, { isActive: false }),
        409,
        'HAS_ACTIVE_CHILDREN',
      );

      await patch(`/programmes/${programme.id}`, { isActive: false }).expect(
        200,
      );
      await patch(`/departments/${department.id}`, { isActive: false }).expect(
        200,
      );
      await patch(`/faculties/${faculty.id}`, { isActive: false }).expect(200);
      await patch(`/campuses/${campus.id}`, { isActive: false }).expect(200);

      expectProblem(
        await h.post('/faculties', registrar.token, {
          campusId: campus.id,
          code: code('F'),
          name: 'Valid Name',
        }),
        422,
        'PARENT_INACTIVE',
      );
      expectProblem(
        await patch(`/faculties/${faculty.id}`, { isActive: true }),
        422,
        'PARENT_INACTIVE',
      );
    });

    it('records before/after values when something changes', async () => {
      const unit = await makeUnit(3);
      await patch(`/units/${unit.id}`, {
        creditPoints: 4,
        name: 'Renamed',
      }).expect(200);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: unit.id, action: 'UNIT_UPDATED' },
      });
      expect(audit.oldValues).toMatchObject({
        name: 'A Unit',
        creditPoints: 3,
      });
      expect(audit.newValues).toMatchObject({
        name: 'Renamed',
        creditPoints: 4,
      });
    });

    it('lists with search, filters and pagination', async () => {
      const marker = code('SRCH');
      await create('/units', {
        code: code('U'),
        name: `${marker} Alpha`,
        creditPoints: 3,
      });
      await create('/units', {
        code: code('U'),
        name: `${marker} Beta`,
        creditPoints: 3,
      });
      const res = await get(
        `/units?search=${marker.toLowerCase()}&limit=1&page=2`,
      ).expect(200);
      expect(res.body).toMatchObject({
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
      expect(res.body.items).toHaveLength(1);

      const inactive = await get('/units?isActive=false').expect(200);
      expect(
        inactive.body.items.every((u: { isActive: boolean }) => !u.isActive),
      ).toBe(true);
    });

    it('is idempotent on creation', async () => {
      const key = randomUUID();
      const body = { code: code('C'), name: 'Once' };
      const send = () =>
        h
          .http()
          .post('/campuses')
          .set(h.bearer(registrar.token))
          .set('Idempotency-Key', key)
          .send(body);
      const first = await send().expect(201);
      const retry = await send().expect(201);
      expect(retry.body.id).toBe(first.body.id);
      expect(await prisma.campus.count({ where: { code: body.code } })).toBe(1);
    });

    it('lets students read but not write', async () => {
      await get('/campuses', student.token).expect(200);
      expectProblem(
        await h.post('/campuses', student.token, {
          code: code('C'),
          name: 'Nope',
        }),
        403,
        'PERMISSION_DENIED',
      );
      expectProblem(
        await patch(`/units/${randomUUID()}`, { name: 'x' }, student.token),
        403,
        'PERMISSION_DENIED',
      );
    });
  });

  describe('curriculum', () => {
    it('places units, and rejects duplicates, out-of-range years and uneditable versions', async () => {
      const { programme } = await buildProgramme(3);
      const unit = await makeUnit();
      const entry = await create(`/programmes/${programme.id}/curriculum`, {
        unitId: unit.id,
        studyYear: 1,
        recommendedSemester: 1,
      });
      expect(entry).toMatchObject({
        curriculumVersion: 1,
        isCompulsory: true,
        prerequisiteIds: [],
      });

      expectProblem(
        await h.post(
          `/programmes/${programme.id}/curriculum`,
          registrar.token,
          { unitId: unit.id, studyYear: 2, recommendedSemester: 1 },
        ),
        409,
        'CURRICULUM_ENTRY_ALREADY_EXISTS',
      );
      const other = await makeUnit();
      expectProblem(
        await h.post(
          `/programmes/${programme.id}/curriculum`,
          registrar.token,
          { unitId: other.id, studyYear: 4, recommendedSemester: 1 },
        ),
        422,
        'VALUE_OUT_OF_RANGE',
      );
      expectProblem(
        await h.post(
          `/programmes/${programme.id}/curriculum`,
          registrar.token,
          {
            unitId: other.id,
            studyYear: 1,
            recommendedSemester: 1,
            curriculumVersion: 3,
          },
        ),
        422,
        'CURRICULUM_VERSION_INVALID',
      );
      expectProblem(
        await h.post(
          `/programmes/${programme.id}/curriculum`,
          registrar.token,
          { unitId: randomUUID(), studyYear: 1, recommendedSemester: 1 },
        ),
        404,
        'UNIT_NOT_FOUND',
      );
    });

    it('builds prerequisite chains, refuses loops, and protects units others depend on', async () => {
      const { programme } = await buildProgramme();
      const [u1, u2, u3] = await Promise.all([
        makeUnit(),
        makeUnit(),
        makeUnit(),
      ]);
      const add = (unit: { id: string }, studyYear: number) =>
        create(`/programmes/${programme.id}/curriculum`, {
          unitId: unit.id,
          studyYear,
          recommendedSemester: 1,
        });
      const [e1, e2, e3] = [
        await add(u1, 1),
        await add(u2, 2),
        await add(u3, 3),
      ];

      await put(`/curriculum-entries/${e2.id}/prerequisites`, {
        prerequisiteIds: [e1.id],
      }).expect(200);
      await put(`/curriculum-entries/${e3.id}/prerequisites`, {
        prerequisiteIds: [e2.id],
      }).expect(200);

      const loop = await put(`/curriculum-entries/${e1.id}/prerequisites`, {
        prerequisiteIds: [e3.id],
      });
      expectProblem(loop, 409, 'PREREQUISITE_CYCLE');
      expect(loop.body.details.unitIds).toEqual([u1.id, u3.id, u2.id, u1.id]);
      expectProblem(
        await put(`/curriculum-entries/${e1.id}/prerequisites`, {
          prerequisiteIds: [e1.id],
        }),
        422,
        'PREREQUISITE_INVALID',
      );
      expect(
        (
          await get(`/curriculum-entries/${e1.id}`).catch(() => ({
            status: 404,
          }))
        ).status,
      ).toBe(404); // no such read route

      // A prerequisite must come from the same programme and version.
      const { programme: other } = await buildProgramme();
      const foreign = await create(`/programmes/${other.id}/curriculum`, {
        unitId: u1.id,
        studyYear: 1,
        recommendedSemester: 1,
      });
      expectProblem(
        await put(`/curriculum-entries/${e2.id}/prerequisites`, {
          prerequisiteIds: [foreign.id],
        }),
        422,
        'PREREQUISITE_INVALID',
      );

      expectProblem(
        await h
          .http()
          .delete(`/curriculum-entries/${e1.id}`)
          .set(h.bearer(registrar.token)),
        409,
        'CURRICULUM_ENTRY_IS_PREREQUISITE',
      );
      await put(`/curriculum-entries/${e2.id}/prerequisites`, {
        prerequisiteIds: [],
      }).expect(200);
      await h
        .http()
        .delete(`/curriculum-entries/${e1.id}`)
        .set(h.bearer(registrar.token))
        .expect(204);

      const removed = await prisma.auditLog.findFirst({
        where: { entityId: e1.id, action: 'CURRICULUM_ENTRY_REMOVED' },
      });
      expect(removed).not.toBeNull();
    });

    it('presents the curriculum in study order, and serves it to other modules through the contract', async () => {
      const { programme } = await buildProgramme();
      const [a, b] = [await makeUnit(), await makeUnit()];
      const eB = await create(`/programmes/${programme.id}/curriculum`, {
        unitId: b.id,
        studyYear: 2,
        recommendedSemester: 1,
        isCompulsory: false,
      });
      const eA = await create(`/programmes/${programme.id}/curriculum`, {
        unitId: a.id,
        studyYear: 1,
        recommendedSemester: 2,
      });
      await put(`/curriculum-entries/${eB.id}/prerequisites`, {
        prerequisiteIds: [eA.id],
      }).expect(200);

      const view = (
        await get(`/programmes/${programme.id}/curriculum`).expect(200)
      ).body;
      expect(view.entries.map((e: { unitCode: string }) => e.unitCode)).toEqual(
        [a.code, b.code],
      );
      expect(view.entries[1]).toMatchObject({
        isCompulsory: false,
        prerequisiteUnitIds: [a.id],
      });

      const reader = h.app.get<CurriculumReader>(CURRICULUM_READER, {
        strict: false,
      });
      expect(await reader.findPlacement(programme.id, 1, b.id)).toMatchObject({
        unitId: b.id,
        studyYear: 2,
        prerequisiteUnitIds: [a.id],
      });
      expect(
        await reader.findPlacement(programme.id, 1, randomUUID()),
      ).toBeNull();
      expect(await reader.listPlacements(programme.id, 1)).toHaveLength(2);
    });

    it('moves new admissions to a new curriculum version only when it is ready', async () => {
      const { programme } = await buildProgramme();
      const unit = await makeUnit();
      await create(`/programmes/${programme.id}/curriculum`, {
        unitId: unit.id,
        studyYear: 1,
        recommendedSemester: 1,
      });

      expectProblem(
        await patch(`/programmes/${programme.id}`, {
          currentCurriculumVersion: 2,
        }),
        422,
        'CURRICULUM_VERSION_INVALID',
      ); // empty
      await create(`/programmes/${programme.id}/curriculum`, {
        unitId: unit.id,
        studyYear: 2,
        recommendedSemester: 1,
        curriculumVersion: 2,
      });
      expectProblem(
        await patch(`/programmes/${programme.id}`, {
          currentCurriculumVersion: 3,
        }),
        422,
        'CURRICULUM_VERSION_INVALID',
      ); // skipping

      const adopted = await patch(`/programmes/${programme.id}`, {
        currentCurriculumVersion: 2,
      }).expect(200);
      expect(adopted.body.currentCurriculumVersion).toBe(2);

      // Version 1 is now history: no further edits.
      const other = await makeUnit();
      expectProblem(
        await h.post(
          `/programmes/${programme.id}/curriculum`,
          registrar.token,
          {
            unitId: other.id,
            studyYear: 1,
            recommendedSemester: 1,
            curriculumVersion: 1,
          },
        ),
        422,
        'CURRICULUM_VERSION_INVALID',
      );
      expect(
        (
          await get(`/programmes/${programme.id}/curriculum?version=1`).expect(
            200,
          )
        ).body.entries,
      ).toHaveLength(1); // still readable
    });

    it('will not shorten a programme below the study year its curriculum already uses', async () => {
      const { programme } = await buildProgramme(4);
      const unit = await makeUnit();
      await create(`/programmes/${programme.id}/curriculum`, {
        unitId: unit.id,
        studyYear: 4,
        recommendedSemester: 1,
      });
      expectProblem(
        await patch(`/programmes/${programme.id}`, { durationYears: 3 }),
        422,
        'VALUE_OUT_OF_RANGE',
      );
      await patch(`/programmes/${programme.id}`, { durationYears: 5 }).expect(
        200,
      );
    });
  });

  describe('calendar', () => {
    const semester = (overrides: object = {}) => ({
      sequence: 1,
      name: 'Semester 1',
      startDate: '2030-09-07',
      endDate: '2030-12-18',
      registrationOpensAt: '2030-08-10T06:00:00Z',
      registrationClosesAt: '2030-09-25T15:00:00Z',
      addDropClosesAt: '2030-10-02T15:00:00Z',
      ...overrides,
    });
    let year: { id: string };
    let sem1: { id: string };

    it('creates an academic year and rejects bad names, backwards dates and overlaps', async () => {
      year = await create('/academic-years', {
        name: '2030/2031',
        startDate: '2030-09-01',
        endDate: '2031-08-31',
      });
      expectProblem(
        await h.post('/academic-years', registrar.token, {
          name: '2030-2031',
          startDate: '2030-09-01',
          endDate: '2031-08-31',
        }),
        422,
        'ACADEMIC_YEAR_INVALID',
      );
      expectProblem(
        await h.post('/academic-years', registrar.token, {
          name: '2031/2032',
          startDate: '2031-08-31',
          endDate: '2031-01-01',
        }),
        422,
        'ACADEMIC_YEAR_INVALID',
      );
      expectProblem(
        await h.post('/academic-years', registrar.token, {
          name: '2031/2032',
          startDate: '2031-06-01',
          endDate: '2032-05-31',
        }),
        409,
        'ACADEMIC_YEAR_OVERLAP',
      );
      expectProblem(
        await h.post('/academic-years', registrar.token, {
          name: '2030/2031',
          startDate: '2040-09-01',
          endDate: '2041-08-31',
        }),
        409,
        'ACADEMIC_YEAR_OVERLAP',
      );
      expectProblem(
        await h.post('/academic-years', registrar.token, {
          name: '2031/2032',
          startDate: '01/09/2031',
          endDate: '2032-05-31',
        }),
        422,
        'VALIDATION_FAILED',
      );
    });

    it('adds semesters and enforces the calendar rules', async () => {
      sem1 = await create(`/academic-years/${year.id}/semesters`, semester());
      await create(
        `/academic-years/${year.id}/semesters`,
        semester({
          sequence: 2,
          name: 'Semester 2',
          startDate: '2031-01-12',
          endDate: '2031-04-30',
          registrationOpensAt: '2030-12-01T06:00:00Z',
          registrationClosesAt: '2031-01-30T15:00:00Z',
          addDropClosesAt: null,
        }),
      );

      const attempt = (body: object) =>
        h.post(`/academic-years/${year.id}/semesters`, registrar.token, body);
      expectProblem(
        await attempt(semester({ sequence: 1 })),
        409,
        'SEMESTER_ALREADY_EXISTS',
      );
      expectProblem(
        await attempt(
          semester({
            sequence: 3,
            startDate: '2030-12-01',
            endDate: '2031-02-01',
            registrationClosesAt: '2030-12-20T00:00:00Z',
            addDropClosesAt: null,
          }),
        ),
        409,
        'SEMESTER_OVERLAP',
      );
      expectProblem(
        await attempt(
          semester({
            sequence: 3,
            startDate: '2031-06-01',
            endDate: '2031-09-30',
            registrationClosesAt: '2031-06-30T00:00:00Z',
            addDropClosesAt: null,
          }),
        ),
        422,
        'SEMESTER_INVALID',
      ); // beyond the year
      expectProblem(
        await attempt(
          semester({
            sequence: 3,
            startDate: '2031-05-01',
            endDate: '2031-06-01',
            registrationClosesAt: '2031-07-01T00:00:00Z',
            addDropClosesAt: null,
          }),
        ),
        422,
        'SEMESTER_INVALID',
      ); // registration outlives the semester
      expectProblem(
        await attempt(
          semester({ sequence: 3, registrationOpensAt: 'not-a-time' }),
        ),
        422,
        'SEMESTER_INVALID',
      );
      expectProblem(
        await attempt(
          semester({ sequence: 3, registrationOpensAt: '2030-08-10T06:00:00' }),
        ),
        422,
        'SEMESTER_INVALID',
      ); // no time zone
    });

    it('edits a semester against its siblings, and guards shrinking the year', async () => {
      expectProblem(
        await patch(`/semesters/${sem1.id}`, { endDate: '2031-02-01' }),
        409,
        'SEMESTER_OVERLAP',
      );
      const ok = await patch(`/semesters/${sem1.id}`, {
        name: 'Autumn',
        registrationClosesAt: '2030-09-30T15:00:00Z',
      }).expect(200);
      expect(ok.body).toMatchObject({
        name: 'Autumn',
        academicYearId: year.id,
      });

      expectProblem(
        await patch(`/academic-years/${year.id}`, { endDate: '2031-03-01' }),
        422,
        'SEMESTER_INVALID',
      );
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: sem1.id, action: 'SEMESTER_UPDATED' },
      });
      expect(audit.oldValues).toMatchObject({ name: 'Semester 1' });
      expect(audit.newValues).toMatchObject({ name: 'Autumn' });
    });

    it('serialises concurrent calendar edits so overlaps cannot slip through', async () => {
      const y = await create('/academic-years', {
        name: '2040/2041',
        startDate: '2040-09-01',
        endDate: '2041-08-31',
      });
      const overlapping = (sequence: number) =>
        h.post(`/academic-years/${y.id}/semesters`, registrar.token, {
          sequence,
          name: `S${sequence}`,
          startDate: '2040-09-07',
          endDate: '2040-12-18',
          registrationOpensAt: '2040-08-10T06:00:00Z',
          registrationClosesAt: '2040-09-25T15:00:00Z',
          addDropClosesAt: null,
        });
      const results = await Promise.all([1, 2, 3, 4].map(overlapping));

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(
        results
          .filter((r) => r.status === 409)
          .every((r) => r.body.code === 'SEMESTER_OVERLAP'),
      ).toBe(true);
      expect(
        await prisma.semester.count({ where: { academicYearId: y.id } }),
      ).toBe(1);
    });

    it('answers calendar questions for other modules through the contract', async () => {
      const calendar = h.app.get<AcademicCalendar>(ACADEMIC_CALENDAR, {
        strict: false,
      });

      expect(await calendar.getSemester(sem1.id)).toMatchObject({
        academicYearName: '2030/2031',
        sequence: 1,
        name: 'Autumn',
      });
      await expect(calendar.getSemester(randomUUID())).rejects.toMatchObject({
        code: 'SEMESTER_NOT_FOUND',
      });

      expect(
        (await calendar.findCurrentSemester(new Date('2030-10-15T00:00:00Z')))
          ?.id,
      ).toBe(sem1.id);
      expect(
        await calendar.findCurrentSemester(new Date('2030-12-25T00:00:00Z')),
      ).toBeNull(); // between semesters
      expect(
        await calendar.findCurrentSemester(new Date('2020-01-01T00:00:00Z')),
      ).toBeNull(); // no such year

      expect(
        await calendar.isRegistrationOpen(
          sem1.id,
          new Date('2030-08-09T23:59:59Z'),
        ),
      ).toBe(false);
      expect(
        await calendar.isRegistrationOpen(
          sem1.id,
          new Date('2030-08-10T06:00:00Z'),
        ),
      ).toBe(true); // opens inclusive
      expect(
        await calendar.isRegistrationOpen(
          sem1.id,
          new Date('2030-09-30T14:59:59Z'),
        ),
      ).toBe(true);
      expect(
        await calendar.isRegistrationOpen(
          sem1.id,
          new Date('2030-09-30T15:00:00Z'),
        ),
      ).toBe(false); // closes exclusive
    });

    it('returns the year with its semesters in order', async () => {
      const res = await get(`/academic-years/${year.id}`).expect(200);
      expect(
        res.body.semesters.map((s: { sequence: number }) => s.sequence),
      ).toEqual([1, 2]);
      expectProblem(
        await get(`/academic-years/${randomUUID()}`),
        404,
        'ACADEMIC_YEAR_NOT_FOUND',
      );
    });
  });

  describe('offerings and seat capacity', () => {
    let unit: { id: string; code: string };
    let semesterId: string;
    const capacity = () =>
      h.app.get<OfferingCapacity>(OFFERING_CAPACITY, { strict: false });
    const newOffering = async (cap = 5, classGroup?: string) =>
      create('/offerings', {
        unitId: unit.id,
        semesterId,
        capacity: cap,
        classGroup: classGroup ?? code('G').slice(0, 5),
      });
    const row = (id: string) =>
      prisma.unitOffering.findUniqueOrThrow({ where: { id } });

    beforeAll(async () => {
      unit = await makeUnit();
      const y = await create('/academic-years', {
        name: '2050/2051',
        startDate: '2050-09-01',
        endDate: '2051-08-31',
      });
      semesterId = (
        await create(`/academic-years/${y.id}/semesters`, {
          sequence: 1,
          name: 'Semester 1',
          startDate: '2050-09-07',
          endDate: '2050-12-18',
          registrationOpensAt: '2050-08-10T06:00:00Z',
          registrationClosesAt: '2050-09-25T15:00:00Z',
        })
      ).id;
    });

    it('creates an offering with a readable view, and rejects duplicates and bad references', async () => {
      const offering = await create('/offerings', {
        unitId: unit.id,
        semesterId,
        capacity: 40,
        classGroup: 'a',
      });
      expect(offering).toMatchObject({
        unitCode: unit.code,
        semesterName: 'Semester 1',
        academicYearName: '2050/2051',
        classGroup: 'A',
        capacity: 40,
        enrolledCount: 0,
        seatsRemaining: 40,
        status: 'OPEN',
      });

      expectProblem(
        await h.post('/offerings', registrar.token, {
          unitId: unit.id,
          semesterId,
          capacity: 10,
          classGroup: 'A',
        }),
        409,
        'OFFERING_ALREADY_EXISTS',
      );
      expectProblem(
        await h.post('/offerings', registrar.token, {
          unitId: unit.id,
          semesterId: randomUUID(),
          capacity: 10,
        }),
        404,
        'SEMESTER_NOT_FOUND',
      );
      expectProblem(
        await h.post('/offerings', registrar.token, {
          unitId: randomUUID(),
          semesterId,
          capacity: 10,
        }),
        404,
        'UNIT_NOT_FOUND',
      );
      expectProblem(
        await h.post('/offerings', registrar.token, {
          unitId: unit.id,
          semesterId,
          capacity: 0,
          classGroup: 'Z',
        }),
        422,
        'VALUE_OUT_OF_RANGE',
      );

      const retired = await makeUnit();
      await patch(`/units/${retired.id}`, { isActive: false }).expect(200);
      expectProblem(
        await h.post('/offerings', registrar.token, {
          unitId: retired.id,
          semesterId,
          capacity: 10,
        }),
        422,
        'PARENT_INACTIVE',
      );
    });

    it('lets exactly `capacity` of many simultaneous reservations succeed', async () => {
      const offering = await newOffering(5);
      const attempts = await Promise.allSettled(
        Array.from({ length: 25 }, () => capacity().reserveSeat(offering.id)),
      );

      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(5);
      const refused = attempts.filter(
        (a): a is PromiseRejectedResult => a.status === 'rejected',
      );
      expect(refused).toHaveLength(20);
      expect(refused.every((r) => r.reason.code === 'OFFERING_FULL')).toBe(
        true,
      );
      expect((await row(offering.id)).enrolledCount).toBe(5);

      const view = (await get(`/offerings/${offering.id}`).expect(200)).body;
      expect(view).toMatchObject({ enrolledCount: 5, seatsRemaining: 0 });
    });

    it('returns seats, never below zero', async () => {
      const offering = await newOffering(3);
      await Promise.all([
        capacity().reserveSeat(offering.id),
        capacity().reserveSeat(offering.id),
      ]);
      await capacity().releaseSeat(offering.id);
      expect((await row(offering.id)).enrolledCount).toBe(1);

      await Promise.all(
        Array.from({ length: 6 }, () => capacity().releaseSeat(offering.id)),
      );
      expect((await row(offering.id)).enrolledCount).toBe(0);
      await capacity().reserveSeat(offering.id); // and the seat is usable again
    });

    it('gives each refusal its own reason', async () => {
      const offering = await newOffering(1);
      await patch(`/offerings/${offering.id}`, { status: 'CLOSED' }).expect(
        200,
      );
      await expect(capacity().reserveSeat(offering.id)).rejects.toMatchObject({
        code: 'OFFERING_NOT_OPEN',
      });
      await expect(capacity().reserveSeat(randomUUID())).rejects.toMatchObject({
        code: 'OFFERING_NOT_FOUND',
      });
      await patch(`/offerings/${offering.id}`, { status: 'OPEN' }).expect(200);
      await capacity().reserveSeat(offering.id);
      await expect(capacity().reserveSeat(offering.id)).rejects.toMatchObject({
        code: 'OFFERING_FULL',
      });
    });

    it('protects enrolled students when capacity or status is edited', async () => {
      const offering = await newOffering(10);
      await Promise.all(
        [1, 2, 3].map(() => capacity().reserveSeat(offering.id)),
      );

      expectProblem(
        await patch(`/offerings/${offering.id}`, { capacity: 2 }),
        422,
        'CAPACITY_BELOW_ENROLMENT',
      );
      expectProblem(
        await patch(`/offerings/${offering.id}`, { status: 'CANCELLED' }),
        422,
        'OFFERING_HAS_ENROLMENTS',
      );
      await patch(`/offerings/${offering.id}`, { capacity: 3 }).expect(200);

      const empty = await newOffering(4);
      await patch(`/offerings/${empty.id}`, { status: 'CANCELLED' }).expect(
        200,
      );
      expectProblem(
        await patch(`/offerings/${empty.id}`, { capacity: 9 }),
        422,
        'OFFERING_CANCELLED',
      );
    });

    it('catches an edit made from stale data when a seat is reserved in between', async () => {
      const offering = await newOffering(10);
      const repository = h.app.get<OfferingRepository>(OFFERING_REPOSITORY, {
        strict: false,
      });

      const stale = (await repository.findById(offering.id))!; // sees 0 enrolled
      await Promise.all(
        [1, 2, 3].map(() => capacity().reserveSeat(offering.id)),
      );
      stale.changeCapacity(2); // legal for what it knows...

      await expect(repository.update(stale)).rejects.toMatchObject({
        code: 'OFFERING_ENROLMENT_CHANGED',
      }); // ...but the database refuses
      expect((await row(offering.id)).capacity).toBe(10);
    });

    it('is also guarded by the database itself (requires prisma/sql/phase3-constraints.sql)', async () => {
      const offering = await newOffering(2);
      await expect(
        prisma.$executeRaw`UPDATE "unit_offerings" SET "enrolled_count" = 3 WHERE "id" = ${offering.id}::uuid`,
      ).rejects.toThrow(
        /unit_offerings_enrolled_within_capacity|check constraint/i,
      );
    });

    it('filters offerings by semester, unit and status', async () => {
      const filtered = await get(
        `/offerings?semesterId=${semesterId}&unitId=${unit.id}&status=OPEN&limit=100`,
      ).expect(200);
      expect(filtered.body.total).toBeGreaterThan(3);
      expect(
        filtered.body.items.every(
          (o: { semesterId: string; status: string }) =>
            o.semesterId === semesterId && o.status === 'OPEN',
        ),
      ).toBe(true);
      expectProblem(
        await get('/offerings?status=BOGUS'),
        422,
        'VALIDATION_FAILED',
      );
    });
  });

  describe('seed presets', () => {
    it('never overwrites an admin-edited role when re-seeding without the flag', async () => {
      await h.setRolePermissions('LECTURER', []);
      await h.app
        .get(IdentitySeeder, { strict: false })
        .run(PERMISSION_CATALOG);
      const roles = (await get('/roles', h.admin.token).expect(200)).body as {
        name: string;
        permissions: string[];
      }[];
      expect(roles.find((r) => r.name === 'LECTURER')!.permissions).toEqual([]);
    });
  });
});

describe('Seed presets with SEED_REAPPLY_PRESETS=true', () => {
  const prisma = createTestPrisma();
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness(prisma, { env: { SEED_REAPPLY_PRESETS: 'true' } });
  });
  afterAll(() => h.close());

  it('restores missing preset permissions but never removes anything an admin added', async () => {
    await h.setRolePermissions('STUDENT', ['audit:log:read']); // drops the preset, adds an extra
    await h.app.get(IdentitySeeder, { strict: false }).run(PERMISSION_CATALOG);

    const roles = (
      await h.http().get('/roles').set(h.bearer(h.admin.token)).expect(200)
    ).body as { name: string; permissions: string[] }[];
    expect(roles.find((r) => r.name === 'STUDENT')!.permissions).toEqual([
      'academic:structure:read',
      'audit:log:read',
    ]);
  });
});

import { AcademicYear } from './entities/academic-year.entity.js';
import type { SemesterInput } from './entities/academic-year.entity.js';
import {
  AwardType,
  Campus,
  Programme,
  Unit,
} from './entities/catalog.entities.js';
import { CurriculumEntry } from './entities/curriculum-entry.entity.js';
import {
  OfferingStatus,
  UnitOffering,
} from './entities/unit-offering.entity.js';
import {
  findPrerequisiteCycle,
  rotateCycleTo,
} from './services/prerequisite-graph.js';
import { Code } from './value-objects/code.vo.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const t = (iso: string) => new Date(iso);
const failsWith = (code: string) => expect.objectContaining({ code });

describe('Code', () => {
  it('normalises to upper case and trims', () => {
    expect(Code.create('  bsc-cs ').value).toBe('BSC-CS');
  });
  it.each([
    '',
    'A',
    'has space',
    '-LEADING',
    'under_score',
    'A'.repeat(21),
    'ünï',
  ])('rejects %j', (raw) => {
    expect(() => Code.create(raw)).toThrow(failsWith('CODE_INVALID'));
  });
});

describe('catalogue entities', () => {
  it('collapses whitespace in names and rejects empty or control-character names', () => {
    expect(Campus.create({ code: 'MAIN', name: '  Main   Campus ' }).name).toBe(
      'Main Campus',
    );
    expect(() => Campus.create({ code: 'MAIN', name: ' x ' })).toThrow(
      failsWith('NAME_INVALID'),
    );
    expect(() =>
      Campus.create({ code: 'MAIN', name: 'Bad\u0000Name' }),
    ).toThrow(failsWith('NAME_INVALID'));
  });

  it('bounds programme duration and unit credit points', () => {
    const base = {
      departmentId: 'x',
      code: 'BSC',
      name: 'Science',
      awardType: AwardType.BACHELORS,
    };
    expect(() => Programme.create({ ...base, durationYears: 0 })).toThrow(
      failsWith('VALUE_OUT_OF_RANGE'),
    );
    expect(() => Programme.create({ ...base, durationYears: 9 })).toThrow(
      failsWith('VALUE_OUT_OF_RANGE'),
    );
    expect(() => Programme.create({ ...base, durationYears: 2.5 })).toThrow(
      failsWith('VALUE_OUT_OF_RANGE'),
    );
    expect(() =>
      Unit.create({ code: 'CSC101', name: 'Intro', creditPoints: 0 }),
    ).toThrow(failsWith('VALUE_OUT_OF_RANGE'));
  });

  it('only advances the curriculum version one step at a time', () => {
    const programme = Programme.create({
      departmentId: 'x',
      code: 'BSC',
      name: 'Science',
      awardType: AwardType.BACHELORS,
      durationYears: 4,
    });
    expect(programme.currentCurriculumVersion).toBe(1);
    expect(() => programme.adoptCurriculumVersion(3)).toThrow(
      failsWith('CURRICULUM_VERSION_INVALID'),
    );
    expect(() => programme.adoptCurriculumVersion(1)).toThrow(
      failsWith('CURRICULUM_VERSION_INVALID'),
    );
    programme.adoptCurriculumVersion(2);
    expect(programme.currentCurriculumVersion).toBe(2);
  });

  it('keeps the code immutable and applies partial updates', () => {
    const unit = Unit.create({
      code: 'csc101',
      name: 'Intro',
      creditPoints: 3,
    });
    unit.update({ name: 'Introduction' });
    expect(unit).toMatchObject({
      code: 'CSC101',
      name: 'Introduction',
      creditPoints: 3,
      isActive: true,
    });
  });
});

describe('CurriculumEntry', () => {
  const base = {
    programmeId: 'p',
    unitId: 'u',
    curriculumVersion: 1,
    studyYear: 1,
    recommendedSemester: 1,
    isCompulsory: true,
  };

  it('keeps the study year inside the programme duration', () => {
    expect(() => CurriculumEntry.create({ ...base, studyYear: 5 }, 4)).toThrow(
      failsWith('VALUE_OUT_OF_RANGE'),
    );
    expect(CurriculumEntry.create({ ...base, studyYear: 4 }, 4).studyYear).toBe(
      4,
    );
  });

  it('de-duplicates prerequisites and hides its internal list', () => {
    const entry = CurriculumEntry.create(base, 4);
    entry.setPrerequisites(['a', 'a', 'b']);
    expect(entry.prerequisiteIds).toEqual(['a', 'b']);
    entry.prerequisiteIds.push('hack');
    expect(entry.prerequisiteIds).toEqual(['a', 'b']);
  });
});

describe('findPrerequisiteCycle', () => {
  const graph = (edges: Record<string, string[]>) =>
    new Map(Object.entries(edges));

  it('accepts a chain and a diamond', () => {
    expect(
      findPrerequisiteCycle(graph({ c: ['b'], b: ['a'], a: [] })),
    ).toBeNull();
    expect(
      findPrerequisiteCycle(
        graph({ d: ['b', 'c'], b: ['a'], c: ['a'], a: [] }),
      ),
    ).toBeNull();
  });

  it('finds a direct loop, an indirect loop, and reports the path', () => {
    expect(findPrerequisiteCycle(graph({ a: ['b'], b: ['a'] }))).toEqual([
      'a',
      'b',
      'a',
    ]);
    expect(
      findPrerequisiteCycle(graph({ a: ['b'], b: ['c'], c: ['a'] })),
    ).toEqual(['a', 'b', 'c', 'a']);
  });

  it('finds a loop that is not reachable from the first node', () => {
    expect(
      findPrerequisiteCycle(graph({ x: [], a: ['b'], b: ['a'] })),
    ).not.toBeNull();
  });
});

describe('AcademicYear', () => {
  const newYear = () =>
    AcademicYear.create({
      name: '2026/2027',
      startDate: d('2026-09-01'),
      endDate: d('2027-08-31'),
    });
  const sem1: SemesterInput = {
    sequence: 1,
    name: 'Semester 1',
    startDate: d('2026-09-07'),
    endDate: d('2026-12-18'),
    registrationOpensAt: t('2026-08-10T06:00:00Z'),
    registrationClosesAt: t('2026-09-25T15:00:00Z'),
    addDropClosesAt: t('2026-10-02T15:00:00Z'),
  };

  it.each(['2026-2027', '2026/2028', '26/27', 'abc'])(
    'rejects the year name %j',
    (name) => {
      expect(() =>
        AcademicYear.create({
          name,
          startDate: d('2026-09-01'),
          endDate: d('2027-08-31'),
        }),
      ).toThrow(failsWith('ACADEMIC_YEAR_INVALID'));
    },
  );

  it('rejects backwards, and absurdly long, years', () => {
    expect(() =>
      AcademicYear.create({
        name: '2026/2027',
        startDate: d('2027-01-01'),
        endDate: d('2026-01-01'),
      }),
    ).toThrow(failsWith('ACADEMIC_YEAR_INVALID'));
    expect(() =>
      AcademicYear.create({
        name: '2026/2027',
        startDate: d('2026-01-01'),
        endDate: d('2027-06-01'),
      }),
    ).toThrow(failsWith('ACADEMIC_YEAR_INVALID'));
  });

  it('accepts a coherent semester, with registration opening before the semester starts', () => {
    const year = newYear();
    expect(year.addSemester(sem1)).toMatchObject({ sequence: 1 });
    expect(year.semesters).toHaveLength(1);
  });

  it.each<[string, Partial<SemesterInput>, string]>([
    ['ends before it starts', { endDate: d('2026-09-01') }, 'SEMESTER_INVALID'],
    [
      'starts before the year',
      { startDate: d('2026-08-01') },
      'SEMESTER_INVALID',
    ],
    ['ends after the year', { endDate: d('2027-09-30') }, 'SEMESTER_INVALID'],
    [
      'has registration closing before it opens',
      { registrationClosesAt: t('2026-08-01T00:00:00Z') },
      'SEMESTER_INVALID',
    ],
    [
      'keeps registration open past the semester end',
      { registrationClosesAt: t('2026-12-30T00:00:00Z') },
      'SEMESTER_INVALID',
    ],
    [
      'sets add/drop before registration opens',
      { addDropClosesAt: t('2026-08-01T00:00:00Z') },
      'SEMESTER_INVALID',
    ],
    [
      'has an invalid date',
      { startDate: new Date('nope') },
      'SEMESTER_INVALID',
    ],
  ])('rejects a semester that %s', (_label, change, code) => {
    expect(() => newYear().addSemester({ ...sem1, ...change })).toThrow(
      failsWith(code),
    );
  });

  it('rejects overlapping semesters and a repeated sequence', () => {
    const year = newYear();
    year.addSemester(sem1);
    expect(() =>
      year.addSemester({
        ...sem1,
        sequence: 2,
        startDate: d('2026-12-10'),
        endDate: d('2027-04-01'),
        registrationClosesAt: t('2026-12-20T00:00:00Z'),
      }),
    ).toThrow(failsWith('SEMESTER_OVERLAP'));
    expect(() =>
      year.addSemester({
        ...sem1,
        startDate: d('2027-01-10'),
        endDate: d('2027-04-01'),
        registrationOpensAt: t('2026-12-20T00:00:00Z'),
        registrationClosesAt: t('2027-02-01T00:00:00Z'),
        addDropClosesAt: null,
      }),
    ).toThrow(failsWith('SEMESTER_ALREADY_EXISTS'));
  });

  it('treats back-to-back semesters as non-overlapping (the end date is exclusive of the next start)', () => {
    const year = newYear();
    year.addSemester(sem1);
    expect(() =>
      year.addSemester({
        sequence: 2,
        name: 'Semester 2',
        startDate: d('2026-12-18'),
        endDate: d('2027-04-30'),
        registrationOpensAt: t('2026-12-01T00:00:00Z'),
        registrationClosesAt: t('2027-01-20T00:00:00Z'),
        addDropClosesAt: null,
      }),
    ).not.toThrow();
  });

  it('validates edits against the siblings but not against itself', () => {
    const year = newYear();
    const first = year.addSemester(sem1);
    expect(
      year.updateSemester(first.id, { endDate: d('2026-12-19') }).endDate,
    ).toEqual(d('2026-12-19'));
    expect(() =>
      year.updateSemester(first.id, { endDate: d('2028-01-01') }),
    ).toThrow(failsWith('SEMESTER_INVALID'));
  });

  it('leaves fields untouched when the patch names them as undefined', () => {
    const year = newYear();
    const first = year.addSemester(sem1);
    const updated = year.updateSemester(first.id, {
      name: 'Autumn',
      startDate: undefined,
      endDate: undefined,
      registrationOpensAt: undefined,
    });
    expect(updated).toMatchObject({
      name: 'Autumn',
      startDate: sem1.startDate,
      endDate: sem1.endDate,
      registrationOpensAt: sem1.registrationOpensAt,
    });
  });

  it('refuses to shrink the year past a semester it contains', () => {
    const year = newYear();
    year.addSemester(sem1);
    expect(() => year.reschedule(d('2026-09-01'), d('2026-11-30'))).toThrow(
      failsWith('SEMESTER_INVALID'),
    );
    expect(() =>
      year.reschedule(d('2026-08-25'), d('2027-08-31')),
    ).not.toThrow();
  });
});

describe('UnitOffering', () => {
  const offering = () =>
    UnitOffering.create({ unitId: 'u', semesterId: 's', capacity: 30 });
  const withEnrolment = (
    enrolledCount: number,
    status: OfferingStatus = OfferingStatus.OPEN,
  ) =>
    UnitOffering.restore('id', {
      unitId: 'u',
      semesterId: 's',
      classGroup: 'A',
      capacity: 30,
      enrolledCount,
      status,
    });

  it('opens with defaults, normalising the class group', () => {
    expect(offering()).toMatchObject({
      classGroup: 'A',
      status: 'OPEN',
      enrolledCount: 0,
      seatsRemaining: 30,
    });
    expect(
      UnitOffering.create({
        unitId: 'u',
        semesterId: 's',
        classGroup: ' b2 ',
        capacity: 5,
      }).classGroup,
    ).toBe('B2');
    expect(() =>
      UnitOffering.create({
        unitId: 'u',
        semesterId: 's',
        classGroup: 'bad group',
        capacity: 5,
      }),
    ).toThrow(failsWith('CODE_INVALID'));
  });

  it.each([0, -1, 5001, 2.5])('rejects capacity %s', (capacity) => {
    expect(() =>
      UnitOffering.create({ unitId: 'u', semesterId: 's', capacity }),
    ).toThrow(failsWith('VALUE_OUT_OF_RANGE'));
  });

  it('never lets capacity fall below the students already enrolled', () => {
    expect(() => withEnrolment(20).changeCapacity(19)).toThrow(
      failsWith('CAPACITY_BELOW_ENROLMENT'),
    );
    expect(() => withEnrolment(20).changeCapacity(20)).not.toThrow();
  });

  it('refuses to cancel an offering that has students, and treats cancellation as final', () => {
    expect(() =>
      withEnrolment(1).changeStatus(OfferingStatus.CANCELLED),
    ).toThrow(failsWith('OFFERING_HAS_ENROLMENTS'));

    const empty = withEnrolment(0);
    empty.changeStatus(OfferingStatus.CANCELLED);
    expect(() => empty.changeStatus(OfferingStatus.OPEN)).toThrow(
      failsWith('OFFERING_CANCELLED'),
    );
    expect(() => empty.changeCapacity(10)).toThrow(
      failsWith('OFFERING_CANCELLED'),
    );
  });

  it('allows closing and reopening', () => {
    const o = withEnrolment(5);
    o.changeStatus(OfferingStatus.CLOSED);
    o.changeStatus(OfferingStatus.OPEN);
    expect(o.status).toBe('OPEN');
  });
});

describe('rotateCycleTo', () => {
  it('reports the same loop from the requested starting point', () => {
    expect(rotateCycleTo(['a', 'b', 'c', 'a'], 'b')).toEqual([
      'b',
      'c',
      'a',
      'b',
    ]);
    expect(rotateCycleTo(['a', 'b', 'c', 'a'], 'a')).toEqual([
      'a',
      'b',
      'c',
      'a',
    ]);
  });

  it('leaves a loop alone when the start is not part of it', () => {
    expect(rotateCycleTo(['a', 'b', 'a'], 'z')).toEqual(['a', 'b', 'a']);
  });
});

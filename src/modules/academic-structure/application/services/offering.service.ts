import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import {
  resolvePage,
  toPaginated,
} from '../../../../shared/application/pagination.js';
import type { PageQuery } from '../../../../shared/application/pagination.js';
import type { TypedConfigService } from '../../../../config/app-config.js';
import {
  BusinessRuleViolationError,
  NotFoundError,
} from '../../../../shared/domain/domain-error.js';
import type { OfferingCapacity } from '../../contracts/offering-capacity.port.js';
import {
  OfferingStatus,
  UnitOffering,
} from '../../domain/entities/unit-offering.entity.js';
import { AcademicErrorCodes as Codes } from '../../domain/errors/academic-error-codes.js';
import {
  CALENDAR_REPOSITORY,
  OFFERING_REPOSITORY,
  UNIT_REPOSITORY,
} from '../../domain/repositories/academic.repositories.js';
import type {
  CalendarRepository,
  OfferingRepository,
  OfferingView,
  UnitRepository,
} from '../../domain/repositories/academic.repositories.js';
import { EntityAudit } from './audited.js';

const snapshot = (o: UnitOffering) => ({
  unitId: o.unitId,
  semesterId: o.semesterId,
  classGroup: o.classGroup,
  capacity: o.capacity,
  status: o.status,
});

@Injectable()
export class OfferingService {
  private readonly audit: EntityAudit;

  constructor(
    @Inject(OFFERING_REPOSITORY) private readonly offerings: OfferingRepository,
    @Inject(UNIT_REPOSITORY) private readonly units: UnitRepository,
    @Inject(CALENDAR_REPOSITORY) private readonly calendar: CalendarRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) audit: AuditLog,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {
    this.audit = new EntityAudit(audit, 'UnitOffering');
  }

  create(input: {
    unitId: string;
    semesterId: string;
    classGroup?: string;
    capacity: number;
  }): Promise<OfferingView> {
    const offering = UnitOffering.create(input);
    return this.transactions.run(async () => {
      const unit = await this.units.findById(input.unitId);
      if (!unit)
        throw new NotFoundError('Unit not found.', {
          code: Codes.UNIT_NOT_FOUND,
        });
      if (!unit.isActive)
        throw new BusinessRuleViolationError('The unit is inactive.', {
          code: Codes.PARENT_INACTIVE,
        });
      if (!(await this.calendar.findYearBySemesterId(input.semesterId))) {
        throw new NotFoundError('Semester not found.', {
          code: Codes.SEMESTER_NOT_FOUND,
        });
      }
      await this.offerings.insert(offering);
      await this.audit.created(offering.id, snapshot(offering));
      return (await this.offerings.findView(offering.id))!;
    });
  }

  update(
    id: string,
    patch: { capacity?: number; status?: OfferingStatus },
  ): Promise<OfferingView> {
    return this.transactions.run(async () => {
      const offering = await this.offerings.findById(id);
      if (!offering)
        throw new NotFoundError('Offering not found.', {
          code: Codes.OFFERING_NOT_FOUND,
        });
      const before = snapshot(offering);
      if (patch.capacity !== undefined) offering.changeCapacity(patch.capacity);
      if (patch.status !== undefined) offering.changeStatus(patch.status);
      await this.offerings.update(offering);
      await this.audit.updated(id, before, snapshot(offering));
      return (await this.offerings.findView(id))!;
    });
  }

  async get(id: string): Promise<OfferingView> {
    const view = await this.offerings.findView(id);
    if (!view)
      throw new NotFoundError('Offering not found.', {
        code: Codes.OFFERING_NOT_FOUND,
      });
    return view;
  }

  async list(
    query: PageQuery & {
      semesterId?: string;
      unitId?: string;
      status?: OfferingStatus;
    },
  ) {
    const page = resolvePage(
      query,
      this.config.get('pagination', { infer: true }),
    );
    const { items, total } = await this.offerings.list(
      {
        semesterId: query.semesterId,
        unitId: query.unitId,
        status: query.status,
      },
      { skip: page.skip, limit: page.limit },
    );
    return toPaginated(items, total, page);
  }
}

/** Implements the public OFFERING_CAPACITY contract. */
@Injectable()
export class OfferingCapacityService implements OfferingCapacity {
  constructor(
    @Inject(OFFERING_REPOSITORY) private readonly offerings: OfferingRepository,
  ) {}

  async reserveSeat(offeringId: string): Promise<void> {
    if (await this.offerings.tryReserveSeat(offeringId)) return;

    // The atomic statement refused. Work out why, so the caller can tell the student something useful.
    const offering = await this.offerings.findById(offeringId);
    if (!offering)
      throw new NotFoundError('Offering not found.', {
        code: Codes.OFFERING_NOT_FOUND,
      });
    if (offering.status !== OfferingStatus.OPEN) {
      throw new BusinessRuleViolationError(
        'This offering is not open for registration.',
        { code: Codes.OFFERING_NOT_OPEN },
      );
    }
    throw new BusinessRuleViolationError('This offering is full.', {
      code: Codes.OFFERING_FULL,
    });
  }

  async releaseSeat(offeringId: string): Promise<void> {
    await this.offerings.tryReleaseSeat(offeringId);
  }
}

# University Portal

University management API (student records, registration, examinations, results, finance) built with **NestJS 12**, **TypeScript**, **Prisma 6** and **PostgreSQL**, as a **modular monolith** using **Clean Architecture**.

## Tech stack

| Concern | Choice |
|---|---|
| Runtime / framework | Node.js 20+ (22 recommended), NestJS 12 (ESM), TypeScript |
| Database | PostgreSQL 16, Prisma 6 (multi-file schema in `prisma/schema/`) |
| Validation | class-validator via a global `ValidationPipe` |
| Logging | nestjs-pino (JSON, request-id correlation, secret redaction) |
| Security | helmet, strict CORS, `@nestjs/throttler`, argon2id (`@node-rs/argon2`), JWT (`jose`), deny-by-default RBAC |
| Tests | Vitest (unit, e2e, integration against real PostgreSQL), Supertest |
| Lint / format | oxlint (type-aware), Prettier |
| Architecture checks | dependency-cruiser |

## Architecture

```
presentation  ->  application  ->  domain  <-  infrastructure
```

| Layer | Contains | May import |
|---|---|---|
| `domain` | Entities, value objects, domain services, domain errors, repository **interfaces** | Nothing outside the domain |
| `application` | Use cases, DTOs, **ports** (interfaces) | domain |
| `infrastructure` | `persistence/` (Prisma repositories), `providers/` (external-service adapters) | domain, application |
| `presentation` | Controllers, guards, request/response mapping | application |

Modules call each other **in-process, synchronously, through `contracts/`** (interface + injection token). Side effects that must not couple modules (notifications, audit, projections) use domain events delivered through a **transactional outbox**. Both rules are enforced by `npm run arch:check`.

### Layout

```
src/
├── config/                      # typed + validated configuration (the only place env is read)
├── health/                      # liveness / readiness wiring
├── shared/                      # shared kernel
│   ├── constants/               # HTTP header names, paths, patterns
│   ├── domain/                  # DomainError, Entity, AggregateRoot, DomainEvent
│   ├── application/             # ports: TransactionManager, DomainEventPublisher, Clock, IdempotencyStore ...
│   ├── infrastructure/          # prisma, outbox, idempotency, logging, time
│   └── presentation/            # problem-details filter, validation pipe, @Idempotent(), health controller
├── modules/                     # one folder per bounded context
│   ├── identity/                # users, auth, sessions, roles, permissions
│   ├── policy/                  # versioned, effective-dated university rules (fee clearance, grading, ...)
│   ├── academic-structure/      # campuses..units, curriculum, calendar, offerings, seat capacity
│   ├── audit/                   # append-only audit trail (read API + writer adapter)
│   └── <next>/{domain,application,infrastructure,presentation,contracts}
├── seed/                        # permission catalog (aggregates every module's permissions)
├── cli/seed.ts                  # `npm run seed`
├── app.module.ts                # composition root
└── main.ts
prisma/schema/                   # base, shared, identity, audit, policy .prisma files
test/                            # e2e tests and fixtures
```

## Cross-cutting guarantees (shared kernel)

- **One error format.** Every failure is an RFC 9457 `application/problem+json` response with a stable `code` and a `correlationId`. Unexpected errors never leak internals.
- **Atomic multi-step writes.** `TransactionManager.run()` opens a transaction carried by `AsyncLocalStorage`; repositories in any module join it automatically.
- **Safe retries.** `@Idempotent()` + `Idempotency-Key` header: a retried request is executed once and the original response is replayed.
- **Reliable events.** `DomainEventPublisher.publish()` writes to the outbox in the same transaction as the business change; a dispatcher delivers events **at least once**, with backoff. Handlers must be idempotent.
- **No hardcoded values.** All tunables come from the environment, validated at boot; the app refuses to start on a missing or invalid value.

## Identity & access (Phase 2)

| Endpoint | Access | Notes |
|---|---|---|
| `POST /auth/login` | public, strict rate limit | Returns `accessToken` (JWT) + `refreshToken` (opaque) |
| `POST /auth/refresh` | public, strict rate limit | Rotates the refresh token; reuse revokes the whole family |
| `POST /auth/logout` | public | Revokes the token family; always `204` |
| `GET /auth/me` | any signed-in user | Roles and current permissions |
| `POST /auth/change-password` | any signed-in user | Revokes all sessions |
| `POST /users` | `identity:user:create` | Requires `Idempotency-Key` |
| `GET /users`, `GET /users/:id` | `identity:user:read` | Paginated; `search`, `isActive` filters |
| `PUT /users/:id/roles` | `identity:user:assign-roles` | Replaces roles |
| `POST /users/:id/activate \| deactivate` | `identity:user:change-status` | Deactivation cuts access immediately |
| `GET /roles`, `GET /permissions` | `identity:role:read` | |
| `PUT /roles/:id/permissions` | `identity:role:manage` | `SUPER_ADMIN` is immutable |
| `GET /audit-logs` | `audit:log:read` | Filter by entity, user, action |

Security model:

- **Deny by default.** Every route needs a valid token unless marked `@Public()`, and must declare `@RequirePermissions(...)` or `@AuthenticatedOnly()`. A route with no declared policy returns `403`.
- **Permissions, not role names.** Roles are bundles of permissions stored in the database. Roles and permissions are re-read on every request, so changes and deactivation take effect immediately, not when the token expires.
- **Sessions.** Short-lived access JWT (HS256, algorithm pinned) plus rotating opaque refresh token stored only as a SHA-256 hash. Reusing a rotated refresh token revokes the entire chain. Changing a password invalidates every existing session.
- **Brute-force defence.** Per-IP strict rate limit on credential endpoints, per-account lockout (atomic counter, so parallel guesses cannot dodge it), and a dummy hash for unknown emails so response time does not reveal which accounts exist.
- **No privilege escalation.** Nobody can grant, revoke or edit a role carrying permissions they do not hold. Administrators cannot change their own roles or status.
- **Audit.** Security-relevant actions write an audit row inside the same transaction as the change (so it exists if and only if the change committed). Failed logins are committed even though the response is `401`.

### Seeding

`npm run seed` is idempotent and safe on every deploy. It syncs the permission catalog from code, creates the seven system roles (`SUPER_ADMIN` always holds every permission; other roles are created empty and then owned by admins), and creates the first admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Remove those two variables afterwards.

When a module adds permissions, append them to `src/seed/permission-catalog.ts` and rerun the seed.

## Policies (Phase 3)

BRD section 13 lists decisions the university must make before they can be coded. They live in the database as **versioned, effective-dated policies**, never in code. Other modules read them through the `POLICY_RESOLVER` contract and always pass the date of the decision being made, so a past decision is judged by the rules that applied then.

| Policy key | Decides |
|---|---|
| `finance.fee_clearance` | Payment required before registration and (separately) before exams: full, percentage, or fixed amount |
| `finance.financial_rules` | Overpayments, refunds, write-offs, cross-semester balances |
| `academics.supplementary` | Qualifying grades, attempts, fee, coursework carry-forward, grade cap |
| `academics.retake` | Attempts, attendance, coursework, fee |
| `results.grade_scale` | Grade bands, grade points, pass mark (bands must cover every mark exactly once) |
| `results.gpa` | GPA method, repeat-unit treatment, degree classification |
| `results.governance` | Moderation, publication, who may approve amendments |
| `examinations.exam_card` | When eligibility is checked; whether holds block a card |

Lifecycle: **draft** (`policy:policy:draft`) -> **approve** (`policy:policy:approve`, never by the author) -> in force from its effective date. Every value is validated against the policy's own strict schema; errors name each offending field. Approval appends to the timeline and closes the previous version; it **cannot take effect in the past** (except the very first version), so history is never rewritten. If no version is in force, the resolver **fails closed** with `POLICY_NOT_CONFIGURED`.

| Endpoint | Permission |
|---|---|
| `GET /policies/definitions` | `policy:policy:read` (includes a valid example of each policy) |
| `GET /policies/:key/versions`, `GET /policies/:key/effective?at=` | `policy:policy:read` |
| `POST /policies/:key/versions` | `policy:policy:draft` (needs `Idempotency-Key`) |
| `POST /policies/versions/:id/approve` | `policy:policy:approve` |
| `DELETE /policies/versions/:id` | `policy:policy:draft` (drafts only) |

## Academic structure (Phase 3)

| Area | Endpoints | Notes |
|---|---|---|
| Catalogue | `/campuses`, `/faculties`, `/departments`, `/programmes`, `/units` (`POST`, `GET`, `GET :id`, `PATCH :id`) | Codes are upper-cased and immutable; records are deactivated, never deleted; a parent cannot be deactivated while it has active children |
| Curriculum | `GET/POST /programmes/:id/curriculum`, `PATCH/DELETE /curriculum-entries/:id`, `PUT /curriculum-entries/:id/prerequisites` | Versioned; prerequisite loops are refused; a new version is adopted by `PATCH /programmes/:id` once it has units |
| Calendar | `/academic-years`, `POST /academic-years/:id/semesters`, `PATCH /semesters/:id` | Semesters cannot overlap or fall outside the year; registration must close before the semester ends |
| Offerings | `/offerings` | Unique per unit, semester and class group |

Reads need `academic:structure:read`; writes need `academic:structure:manage`, `academic:curriculum:manage`, `academic:calendar:manage` or `academic:offering:manage`.

Public contracts for later modules (import only these):

- `ACADEMIC_CALENDAR`: semester facts, "current" semester, is registration open.
- `CURRICULUM_READER`: a unit's placement and prerequisite unit ids for a programme and curriculum version.
- `OFFERING_CAPACITY`: `reserveSeat` / `releaseSeat`, each one atomic SQL statement, so simultaneous registrations can never oversubscribe an offering. Call inside the registration transaction.

### Database constraints (one manual step)

Prisma cannot express `CHECK` constraints, so they ship as SQL. Add them to the Phase 3 migration:

```bash
npx prisma migrate dev --create-only --name academic_structure
# append the contents of prisma/sql/phase3-constraints.sql to the new migration.sql, then:
npx prisma migrate dev
```

They are a safety net (the application enforces the same rules), and `npm run test:int` fails loudly if they are missing.

### Role presets

New roles receive starting permissions (`src/modules/identity/infrastructure/seed/role-presets.ts`): `REGISTRAR` manages the academic structure and drafts policies; `FINANCE_ADMIN` drafts policies; lecturers, students, HODs and finance officers can read the structure. **Nobody but `SUPER_ADMIN` can approve policies** until the university decides who else may. Roles that already exist are not touched; run the seed with `SEED_REAPPLY_PRESETS=true` to add any missing preset permissions (additive only).

## Getting started

Prerequisites: Node.js 20+, npm, Docker.

```bash
npm install
cp .env.example .env            # then adjust values
docker compose up -d            # PostgreSQL (and Redis)
npx prisma migrate dev --name init_foundation   # then add the CHECK constraints (see "Database constraints")
npm run build && npm run seed   # first run: permissions, roles, first admin
npm run start:dev
```

- Health: `GET /health/live`, `GET /health/ready`
- API: `http://localhost:3000/api/v1`
- Swagger (when `SWAGGER_ENABLED=true`): `http://localhost:3000/docs`

## Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` / `npm run start:prod` | Compile / run compiled output |
| `npm test` | Unit tests |
| `npm run test:e2e` | HTTP-level tests of the shared kernel (database faked) |
| `npm run test:int` | Full-stack tests against a real PostgreSQL test database (see below) |
| `npm run seed` | Sync permissions and roles, create the first admin (run `npm run build` first) |
| `npm run lint` | oxlint, type-aware |
| `npm run arch:check` | Enforce layer and module boundaries |
| `npx prisma migrate dev --name <name>` | Create and apply a migration |
| `npx prisma studio` | Browse data |

## Integration tests

They boot the real `AppModule` against a real database and **truncate every table**, so the suite refuses to run unless the database name ends in `_test`.

```bash
docker compose exec postgres createdb -U postgres university_portal_test
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/university_portal_test?schema=public" npx prisma migrate deploy
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/university_portal_test" npm run test:int
```

## Conventions

- **ESM:** relative imports end in `.js` (`import { X } from './x.js'`).
- **Injecting interfaces:** use `import type` for the interface and `@Inject(TOKEN)` on the parameter. The class-based providers (`ConfigService`) are injected with `@Inject(ConfigService)` where the parameter is typed with an alias.
- **Config:** never read `process.env` outside `src/config`. Add the variable to `EnvironmentVariables`, `AppConfig`, `buildConfiguration` and `.env.example`.
- **Cross-module calls:** import only from another module's `contracts/`.
- **Policies:** never hardcode a university rule. Read it with `POLICY_RESOLVER.resolve(key, decisionDate)`.
- **Seats:** only `OFFERING_CAPACITY` may change `enrolledCount`.
- **Audit:** call the `AUDIT_LOG` port from the use case, inside the transaction, with before/after values. Never put secrets or national ids in audit values.
- **New permissions:** declare them in the module's `contracts/permissions.ts`, add them to `src/seed/permission-catalog.ts`, then rerun the seed.
- **Money:** `Decimal`, never floats (introduced with the finance module).

## Roadmap

- [x] Phase 1: foundation (config, logging, errors, transactions, outbox, idempotency, health, architecture rules, base schema)
- [x] Phase 2: identity (auth, refresh rotation, permission guards, audit trail)
- [x] Phase 3: policy, academic structure
- [ ] Phase 4: people (students, lecturers, admissions, holds)
- [ ] Phase 5: finance (ledger, payments, M-Pesa, fee clearance)
- [ ] Phase 6: registration (normal, supplementary, retake)
- [ ] Phase 7: examinations (eligibility, exam cards)
- [ ] Phase 8: results (marks, submission, amendments, versions, GPA)
- [ ] Phase 9: notifications, reporting, hardening, CI/CD

## License

UNLICENSED. Update to match your chosen license.

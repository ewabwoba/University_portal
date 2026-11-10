# University Portal

A university management system API built with **NestJS**, **TypeScript**, **Prisma** and **PostgreSQL**, structured with **Clean Architecture** and modular, domain-driven boundaries.

## Features

| Module | Responsibility | Status |
|---|---|---|
| Identity & Access | Users, roles, JWT auth, refresh tokens, RBAC | In progress |
| Academic Structure | Faculties, departments, programmes, courses, semesters | Planned |
| Admissions | Applications, review, admission offers | Planned |
| Student Records | Student profiles, enrolment, status | Planned |
| Course Registration | Unit registration, prerequisites, capacity limits | Planned |
| Timetabling | Venues, sessions, clash detection | Planned |
| Assessment & Grading | Marks, grades, GPA, transcripts | Planned |
| Finance | Fee structures, invoices, payments, balances | Planned |
| Staff / HR | Lecturers, course assignments | Planned |
| Notifications & Reporting | Email/SMS, audit logs, reports | Planned |

## Tech Stack

- **Framework:** NestJS 11, TypeScript (strict mode)
- **Database:** PostgreSQL 16 with Prisma 6 ORM
- **Cache / Queues:** Redis 7 (BullMQ, planned)
- **Auth:** JWT access and refresh tokens, role-based access control
- **Validation:** class-validator, class-transformer
- **Docs:** Swagger / OpenAPI
- **Testing:** Jest, Supertest
- **Tooling:** Docker Compose, ESLint, Prettier

## Architecture

Each module is split into four layers. Dependencies point inward only.

```
presentation  →  application  →  domain  ←  infrastructure
```

| Layer | Contains | May depend on |
|---|---|---|
| **Domain** | Entities, value objects, domain services, repository interfaces, domain errors | Nothing external |
| **Application** | Use cases, DTOs, ports | Domain |
| **Infrastructure** | Prisma repositories, hashing, token services, mappers | Domain, Application |
| **Presentation** | Controllers, guards, request/response mapping | Application |

Rules:

1. The domain layer never imports from NestJS, Prisma or any external library.
2. Use cases depend on repository **interfaces**, bound to implementations through injection tokens in each module.
3. Controllers stay thin: validate input, call a use case, map the response.
4. Domain errors (`NotFoundError`, `ConflictError`, ...) are translated to HTTP responses by a global exception filter.
5. Modules communicate through application-level interfaces or domain events, never by reading each other's tables.

### Project structure

```
src/
├── shared/                          # Shared kernel
│   ├── domain/                      # Entity base class, domain errors
│   ├── infrastructure/
│   │   ├── config/                  # Environment validation
│   │   └── prisma/                  # PrismaModule and PrismaService
│   └── presentation/filters/        # Domain exception filter
├── modules/
│   └── identity/
│       ├── domain/                  # entities, value-objects, repositories, errors
│       ├── application/             # use-cases, dto, ports
│       ├── infrastructure/          # persistence, security
│       ├── presentation/            # controllers, guards
│       └── identity.module.ts
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma
└── migrations/
```

## Getting Started

### Prerequisites

- Node.js 20 or 22 (LTS)
- npm
- Docker and Docker Compose

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env

# 3. Start PostgreSQL and Redis
docker compose up -d

# 4. Apply database migrations and generate the Prisma client
npx prisma migrate dev

# 5. Start the app in watch mode
npm run start:dev
```

The API runs at `http://localhost:3000/api/v1` and the Swagger docs at `http://localhost:3000/docs`.

### Environment variables

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/university_portal?schema=public` |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens | long random string |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | long random string |
| `JWT_ACCESS_TTL` | Access token lifetime | `15m` |
| `JWT_REFRESH_TTL` | Refresh token lifetime | `7d` |

Never commit `.env`. Use strong, unique secrets outside local development.

## Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Start in watch mode |
| `npm run start:prod` | Run the compiled build |
| `npm run build` | Compile TypeScript |
| `npm run lint` | Lint and fix |
| `npm run test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:cov` | Coverage report |
| `npx prisma migrate dev --name <name>` | Create and apply a migration |
| `npx prisma studio` | Browse the database |

## Roles

`ADMIN`, `REGISTRAR`, `LECTURER`, `STUDENT`, `FINANCE`

Access to endpoints is restricted with the `@Roles()` decorator and a roles guard.

## Roadmap

- [x] Foundation: config, Prisma, Docker, Swagger, error handling
- [ ] Identity & Access: registration, login, refresh, RBAC
- [ ] Academic Structure
- [ ] Students & Admissions
- [ ] Course Registration (prerequisites, capacity)
- [ ] Assessment & Grading (GPA as pure domain services)
- [ ] Finance (fee clearance gating registration)
- [ ] Timetabling, Notifications, Reports
- [ ] Hardening: CI/CD, rate limiting, audit trail, deployment

## Contributing

1. Create a feature branch from `main`.
2. Keep new code inside the correct layer and respect the dependency rules above.
3. Add unit tests for domain logic and use cases.
4. Run `npm run lint` and `npm run test` before opening a pull request.

## License

UNLICENSED. Update this section to match your chosen license.
/**
 * Architecture rules. `npm run arch:check` must pass in CI.
 * Layers: domain <- application <- (infrastructure | presentation). Modules talk only via `contracts/`.
 */
const LAYER = '(shared|modules/[^/]+)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make modules impossible to reason about or extract.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-depends-on-nothing-outward',
      severity: 'error',
      comment: 'The domain layer may not import application, infrastructure or presentation code.',
      from: { path: `^src/${LAYER}/domain/` },
      to: { path: `^src/${LAYER}/(application|infrastructure|presentation)/` },
    },
    {
      name: 'domain-framework-free',
      severity: 'error',
      comment: 'The domain layer must not import Nest, Prisma, validation or HTTP libraries.',
      from: { path: `^src/${LAYER}/domain/` },
      to: { path: '^node_modules/(@nestjs|@prisma|prisma|class-validator|class-transformer|rxjs|express)/' },
    },
    {
      name: 'application-not-on-outer-layers',
      severity: 'error',
      comment: 'Use cases depend on ports (interfaces), never on infrastructure or presentation.',
      from: { path: `^src/${LAYER}/application/` },
      to: { path: `^src/${LAYER}/(infrastructure|presentation)/` },
    },
    {
      name: 'presentation-not-on-infrastructure',
      severity: 'error',
      comment: 'Controllers call use cases. They never touch Prisma, providers or repositories directly.',
      from: { path: `^src/${LAYER}/presentation/` },
      to: { path: `^src/${LAYER}/infrastructure/` },
    },
    {
      name: 'infrastructure-not-on-presentation',
      severity: 'error',
      from: { path: `^src/${LAYER}/infrastructure/` },
      to: { path: `^src/${LAYER}/presentation/` },
    },
    {
      name: 'modules-only-via-contracts',
      severity: 'error',
      comment: 'A module may import another module ONLY through its contracts/ folder.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/contracts/'],
      },
    },
    {
      name: 'shared-kernel-knows-no-module',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'modules-not-on-composition-root',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { path: '^src/(app\\.module|main)\\.ts$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.spec\\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};

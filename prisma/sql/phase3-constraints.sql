-- Database-level guards Prisma's schema language cannot express. Add to the Phase 3 migration:
--   npx prisma migrate dev --create-only --name academic_structure
--   (append this file's contents to the generated migration.sql, then) npx prisma migrate dev
-- They are belt-and-braces: the application enforces the same rules, but the database must never accept a violation.

ALTER TABLE "unit_offerings"
  ADD CONSTRAINT "unit_offerings_capacity_positive" CHECK ("capacity" > 0),
  ADD CONSTRAINT "unit_offerings_enrolled_within_capacity" CHECK ("enrolled_count" >= 0 AND "enrolled_count" <= "capacity");

ALTER TABLE "units"
  ADD CONSTRAINT "units_credit_points_positive" CHECK ("credit_points" > 0);

ALTER TABLE "programmes"
  ADD CONSTRAINT "programmes_duration_positive" CHECK ("duration_years" > 0),
  ADD CONSTRAINT "programmes_curriculum_version_positive" CHECK ("current_curriculum_version" > 0);

ALTER TABLE "programme_units"
  ADD CONSTRAINT "programme_units_study_year_positive" CHECK ("study_year" > 0),
  ADD CONSTRAINT "programme_units_semester_positive" CHECK ("recommended_semester" > 0),
  ADD CONSTRAINT "programme_units_version_positive" CHECK ("curriculum_version" > 0);

ALTER TABLE "programme_unit_prerequisites"
  ADD CONSTRAINT "programme_unit_prerequisites_not_self" CHECK ("programme_unit_id" <> "prerequisite_id");

ALTER TABLE "academic_years"
  ADD CONSTRAINT "academic_years_dates_ordered" CHECK ("end_date" > "start_date");

ALTER TABLE "semesters"
  ADD CONSTRAINT "semesters_dates_ordered" CHECK ("end_date" > "start_date"),
  ADD CONSTRAINT "semesters_registration_window_ordered" CHECK ("registration_closes_at" > "registration_opens_at");

-- Policy versions: one numbered history per key, and an effective period that cannot run backwards.
ALTER TABLE "policy_versions"
  ADD CONSTRAINT "policy_versions_effective_period_ordered" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");

-- CreateTable
CREATE TABLE "daily_active_users" (
    "org_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "user_count" INTEGER NOT NULL,

    CONSTRAINT "daily_active_users_pkey" PRIMARY KEY ("org_id","date")
);

-- CreateTable
CREATE TABLE "course_completion_stats" (
    "course_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "enrolled_count" INTEGER NOT NULL,
    "completed_count" INTEGER NOT NULL,
    "avg_progress_pct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "course_completion_stats_pkey" PRIMARY KEY ("course_id","date")
);

-- AddForeignKey
ALTER TABLE "daily_active_users" ADD CONSTRAINT "daily_active_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_completion_stats" ADD CONSTRAINT "course_completion_stats_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

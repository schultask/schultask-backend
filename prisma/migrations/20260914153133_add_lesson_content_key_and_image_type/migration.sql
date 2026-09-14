-- AlterEnum
ALTER TYPE "LessonContentType" ADD VALUE 'image';

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "content_key" TEXT;

"use client";

import { useQuery } from "@tanstack/react-query";

import { StatusMessage } from "@/components/StatusMessage";
import { getCourses } from "@/lib/api/services/courses";
import { formatMoney, formatNullableNumber } from "@/lib/format";
import type { CourseListResponse } from "@/lib/types/api";

export default function CoursesPage() {
  const coursesQuery = useQuery<CourseListResponse>({
    queryKey: ["courses"],
    queryFn: getCourses,

    // The API owns the preview lifetime. When that period expires,
    // React Query considers the cached course list stale.
    staleTime: (query) =>
      (query.state.data?.previewExpiresInSeconds ?? 0) * 1000,
  });

  if (coursesQuery.isPending) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <StatusMessage state="loading" />
      </main>
    );
  }

  if (coursesQuery.isError) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <StatusMessage
          state="error"
          message="We could not load the courses. Please try again."
        />
      </main>
    );
  }

  const courses = coursesQuery.data.courses;

  if (courses.length === 0) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <StatusMessage
          state="empty"
          message="No published courses are available yet."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Courses</h1>
        <p className="mt-2 text-slate-600">
          Explore the currently available Bema Learn courses.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {courses.map((course) => (
          <article
            key={course.id}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-slate-900">
              {course.title}
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Instructor: {course.instructorName}
            </p>

            <p className="mt-4 text-lg font-semibold text-slate-900">
              {formatMoney(course.priceMinor, course.currency)}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Enrolments</dt>
                <dd className="font-medium text-slate-900">
                  {formatNullableNumber(course.enrolmentCount)}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Rating</dt>
                <dd className="font-medium text-slate-900">
                 {formatNullableNumber(course.averageRating)}
                 {course.averageRating === null ? "" : "/5"}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </main>
  );
}
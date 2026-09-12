import api from "@/lib/api/client";
import type { CourseListResponse } from "@/lib/types/api";

export async function getCourses(): Promise<CourseListResponse> {
  const response = await api.get<CourseListResponse>("/courses");
  return response.data;
}
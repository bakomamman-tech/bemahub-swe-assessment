import api from "@/lib/api/client";
import type { LoginResponse } from "@/lib/types/api";

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/login", {
    email,
    password,
  });

  return response.data;
}
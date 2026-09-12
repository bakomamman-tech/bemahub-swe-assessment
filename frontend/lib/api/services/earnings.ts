import api from "@/lib/api/client";
import type { Earnings } from "@/lib/types/api";

export async function getEarnings(): Promise<Earnings> {
  const response = await api.get<Earnings>("/me/earnings");
  return response.data;
}
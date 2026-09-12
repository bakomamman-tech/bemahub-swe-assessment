/**
 * Shared axios instance.
 *
 * The request interceptor attaches the stored bearer token automatically.
 * Callers should never set Authorization manually.
 *
 * A 401 response clears stale authentication state. The original Axios error
 * is still rejected so callers can distinguish an HTTP/business refusal from
 * a transport failure where error.response is undefined.
 */
import axios from "axios";

import { getStoredToken, useAuthStore } from "@/lib/auth/authStore";

const baseURL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080/wp-json/bemalearn/v1";

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = getStoredToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      useAuthStore.getState().signOut();
    }

    return Promise.reject(error);
  }
);

export default api;
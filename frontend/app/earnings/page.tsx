"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { StatusMessage } from "@/components/StatusMessage";
import { getEarnings } from "@/lib/api/services/earnings";
import { useAuthStore } from "@/lib/auth/authStore";
import { formatMoney } from "@/lib/format";
import type { ApiError, Earnings } from "@/lib/types/api";
import { WithdrawalForm } from "@/components/WithdrawalForm";

export default function EarningsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const hydrate = useAuthStore((state) => state.hydrate);
  const signOut = useAuthStore((state) => state.signOut);

  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    hydrate();
    setAuthReady(true);
  }, [hydrate]);

  const earningsQuery = useQuery<Earnings>({
    queryKey: ["earnings", user?.id],
    queryFn: getEarnings,
    enabled: authReady && Boolean(token),
    retry: false,
  });

  function handleSignOut() {
    signOut();

    queryClient.removeQueries({
      queryKey: ["earnings"],
    });

    router.push("/login");
  }

  if (!authReady) {
    return <StatusMessage state="loading" />;
  }

  if (!token) {
    return (
      <section className="mx-auto max-w-xl">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-semibold text-slate-900">
            Sign in required
          </h2>

          <p className="mt-2 text-sm text-slate-700">
            You are signed out. Sign in to view instructor earnings.
          </p>

          <Link
            href="/login"
            className="mt-5 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Go to sign in
          </Link>
        </div>
      </section>
    );
  }

  if (earningsQuery.isPending) {
    return <StatusMessage state="loading" />;
  }

  if (earningsQuery.isError) {
    const error = earningsQuery.error;

    let message =
      "We could not load your earnings. Please try again.";

    if (axios.isAxiosError<ApiError>(error)) {
      if (!error.response) {
        message =
          "The Bema Learn API could not be reached. Your permissions have not been evaluated.";
      } else if (error.response.status === 403) {
        message =
          "You are signed in, but this account is not permitted to view instructor earnings.";
      } else if (error.response.status === 401) {
        message =
          "Your session is missing or has expired. Please sign in again.";
      } else if (error.response.data?.message) {
        message = error.response.data.message;
      }
    }

    return (
      <section className="mx-auto max-w-xl space-y-4">
        <StatusMessage state="error" message={message} />

        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          Sign out
        </button>
      </section>
    );
  }

  const earnings = earningsQuery.data;

  return (
    <section className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Instructor earnings
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            Signed in as {user?.name ?? "instructor"}.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          Sign out
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Available</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatMoney(earnings.availableMinor, earnings.currency)}
          </p>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatMoney(earnings.pendingMinor, earnings.currency)}
          </p>
        </article>
      </div>

      <dl className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-5">
        <div className="flex justify-between gap-4 py-4">
          <dt className="text-sm text-slate-500">Minimum withdrawal</dt>
          <dd className="text-sm font-medium text-slate-900">
            {formatMoney(
              earnings.minimumWithdrawalMinor,
              earnings.currency
            )}
          </dd>
        </div>

        <div className="flex justify-between gap-4 py-4">
          <dt className="text-sm text-slate-500">Last withdrawal</dt>
          <dd className="text-sm font-medium text-slate-900">
            {earnings.lastWithdrawalAt
              ? new Date(earnings.lastWithdrawalAt).toLocaleString("en-NG")
              : "Never"}
          </dd>
        </div>
      </dl>
      <WithdrawalForm
  availableMinor={earnings.availableMinor}
  minimumWithdrawalMinor={earnings.minimumWithdrawalMinor}
  currency={earnings.currency}
/>
    </section>
  );
}

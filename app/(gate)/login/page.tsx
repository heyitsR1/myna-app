import type { Metadata } from "next";
import "@/app/flow.css";
import LoginForm from "@/components/auth/LoginForm";
import { safeNextPath } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · Myna" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return <LoginForm next={safeNextPath(typeof next === "string" ? next : null)} />;
}

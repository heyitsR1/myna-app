import type { Metadata } from "next";
import "@/app/flow.css";
import LoginForm from "@/components/auth/LoginForm";
import { dela } from "@/app/fonts/dela";
import { safeNextPath } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · Myna" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className={dela.variable}>
      <LoginForm next={safeNextPath(typeof next === "string" ? next : null)} />
    </div>
  );
}

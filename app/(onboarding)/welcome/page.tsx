import type { Metadata } from "next";
import "@/app/flow.css";
import Onboarding from "@/components/onboarding/Onboarding";

export const metadata: Metadata = { title: "Set up Maya · Myna" };

export default function WelcomePage() {
  return <Onboarding />;
}

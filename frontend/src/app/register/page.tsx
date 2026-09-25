import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect("/");

  return <AuthForm initialMode="signup" />;
}

import { redirect } from "next/navigation";
import { isActivated } from "@/lib/data/activation";
import { auth } from "@/lib/auth/auth-options";
import ActivateClient from "./activate-client";

export default async function ActivatePage() {
  const activated = await isActivated();

  if (activated) {
    redirect("/");
  }

  // This page requires authentication (middleware enforces login).
  // The user signs in via Azure AD first, then enters the activation code.
  const session = await auth();
  const userName = session?.user?.name || session?.user?.email || "";

  return <ActivateClient userName={userName} />;
}

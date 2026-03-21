import { redirect } from "next/navigation";
import { isActivated } from "@/lib/data/activation";
import LoginClient from "./login-client";

export default async function LoginPage() {
  const activated = await isActivated();

  if (!activated) {
    redirect("/activate");
  }

  return <LoginClient ssoEnabled={!!process.env.AZURE_AD_CLIENT_ID} />;
}

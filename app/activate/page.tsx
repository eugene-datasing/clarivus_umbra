import { redirect } from "next/navigation";
import { isActivated } from "@/lib/data/activation";
import ActivateClient from "./activate-client";

export default async function ActivatePage() {
  const activated = await isActivated();

  if (activated) {
    redirect("/login");
  }

  return <ActivateClient />;
}

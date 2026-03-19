import { getAllRules } from "@/lib/data/rules";
import RulesClient from "./rules-client";

export default async function CustomRulesPage() {
  const rules = await getAllRules();
  return <RulesClient rules={rules} />;
}

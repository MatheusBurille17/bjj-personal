import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getPlans } from "@/lib/services/plan.service";
import { PlansView } from "@/components/plans/plans-view";

export const metadata: Metadata = { title: "Planos de aula" };
export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const result = await getPlans(session.user.id, {
    status: ["draft", "published"],
    page: 1,
    pageSize: 20,
  });

  return (
    <PlansView
      initialPlans={result.plans}
      initialPagination={result.pagination}
      initialOpen={params.new === "1"}
    />
  );
}

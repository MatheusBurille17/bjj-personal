import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getLibraryTree } from "@/lib/services/library.service";
import { LibraryView } from "@/components/library/library-view";

export const metadata: Metadata = { title: "Biblioteca de técnicas" };
export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const tree = await getLibraryTree(session.user.id, true);

  return <LibraryView tree={tree} initialNew={params.new === "1"} />;
}

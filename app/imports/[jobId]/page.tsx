import { ImportReviewWorkspace } from "@/components/imports/import-review-workspace";

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <ImportReviewWorkspace jobId={jobId} />;
}

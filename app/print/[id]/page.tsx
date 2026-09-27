import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ResumeSchema, type Resume } from "@/lib/schemas";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { MitbTemplate } from "@/components/resume/MitbTemplate";

export const dynamic = "force-dynamic";

/**
 * Bare, chrome-free render of one resume version. Playwright loads this page to
 * print the PDF, so it uses exactly the same component + CSS as the editor preview.
 * `/print/sample` renders the built-in sample resume.
 */
export default async function PrintPage({ params, searchParams }: PageProps<"/print/[id]">) {
  const { id } = await params;
  const { version } = await searchParams;
  let resume: Resume;
  if (id === "sample") {
    resume = SAMPLE_RESUME;
  } else {
    const v = version
      ? await prisma.resumeVersion.findFirst({ where: { id: String(version), applicationId: id } })
      : await prisma.resumeVersion.findFirst({ where: { applicationId: id }, orderBy: { createdAt: "desc" } });
    if (!v) notFound();
    resume = ResumeSchema.parse(JSON.parse(v.resume));
  }
  return (
    <div style={{ background: "#fff" }}>
      <MitbTemplate resume={resume} />
    </div>
  );
}

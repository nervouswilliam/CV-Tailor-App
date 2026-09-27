/**
 * Seed the database.
 *   npm run db:seed           → settings + profile (name pre-filled), nothing else
 *   npm run db:seed -- --demo → also a demo application using the sample resume,
 *                               so the editor can be tried without an API key.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ProfileSchema } from "../lib/schemas";
import { SAMPLE_RESUME } from "../lib/sample-resume";

const prisma = new PrismaClient();
const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

async function main() {
  const systemPrompt = fs.readFileSync(path.join(__dirname, "..", "prompts", "system.md"), "utf8");
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, systemPrompt, model }, update: {} });

  const principles = systemPrompt.match(/^#+\s*Strategic Principles\s*\n([\s\S]*?)(?=^#{1,2}\s|$(?![\s\S]))/im)?.[1].trim() ?? "";
  const existing = await prisma.profile.findUnique({ where: { id: 1 } });
  if (!existing) {
    const profile = ProfileSchema.parse({ personal: { name: "Jeremiah William Sebastian" }, strategicNotes: principles });
    await prisma.profile.create({ data: { id: 1, data: JSON.stringify(profile) } });
    console.log("Created profile");
  }

  if (process.argv.includes("--demo")) {
    const id = rid();
    await prisma.application.create({
      data: {
        id,
        company: "Demo Corp",
        roleTitle: "Data Analyst",
        jobDescription:
          "We are looking for a Data Analyst to turn data into insights for our product and growth teams. You will build dashboards in Tableau or Power BI, write SQL and Python to analyse user behaviour, run A/B tests, and present recommendations to stakeholders. Requirements: 2+ years in analytics, strong SQL, Python (pandas), experience with experimentation, excellent stakeholder communication. Nice to have: machine learning, LLM experience, fintech background.",
        analysis: JSON.stringify({
          roleType: "Product / growth analytics",
          summary: "Demo analysis.",
          coreRequirements: ["SQL", "Python", "Dashboards", "Experimentation", "Stakeholder communication"],
          niceToHaves: ["Machine learning", "Fintech"],
          keywords: ["SQL", "Python", "Tableau", "Power BI", "A/B tests", "stakeholders", "dashboards", "machine learning", "fintech", "insights"],
          matches: [],
          gaps: [],
          questions: [],
        }),
        probingQA: "[]",
        rationale: JSON.stringify({ included: ["Demo: sample resume"], excluded: [], framing: [], openQuestions: [] }),
      },
    });
    await prisma.resumeVersion.create({ data: { id: rid(), applicationId: id, resume: JSON.stringify(SAMPLE_RESUME), changeSummary: "Demo resume" } });
    await prisma.activityLog.create({ data: { id: rid(), type: "generate", message: "Generated CV for Demo Corp — Data Analyst", applicationId: id } });
    console.log(`Created demo application ${id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import type { Resume } from "./schemas";

/** Hard-coded sample used to check the template and PDF export before any AI is involved. */
export const SAMPLE_RESUME: Resume = {
  header: {
    name: "Jeremiah William Sebastian",
    email: "name@example.com",
    phone: "+65 8000 0000",
    linkedin: "linkedin.com/in/example",
  },
  education: [
    {
      id: "edu1",
      institution: "Singapore Management University",
      location: "Singapore",
      startDate: "Aug 2025",
      endDate: "Dec 2026",
      degree: "Master of IT in Business (Analytics Track)",
      grade: "GPA: 3.8 / 4.0",
      coursework: ["Applied Machine Learning", "Data Management", "Visual Analytics", "Financial Analytics"],
    },
    {
      id: "edu2",
      institution: "Sample University",
      location: "Jakarta, Indonesia",
      startDate: "Aug 2017",
      endDate: "Jul 2021",
      degree: "Bachelor of Computer Science",
      grade: "GPA: 3.6 / 4.0",
    },
  ],
  experience: [
    {
      id: "co1",
      name: "Sample Fintech Startup",
      location: "Jakarta, Indonesia",
      descriptor: "Seed-stage personal finance app serving young professionals in Southeast Asia",
      roles: [
        {
          id: "r1",
          title: "AI Engineer",
          startDate: "Jan 2024",
          endDate: "Jul 2025",
          bullets: [
            { id: "b1", text: "Built a retrieval-augmented support assistant over 2,000 help articles, deflecting 35% of inbound tickets and saving ~$120,000 a year in support costs", sourceRef: "sample" },
            { id: "b2", text: "Designed evaluation harness with 300 labelled conversations to track answer accuracy release-over-release, raising accuracy from 71% to 89%", sourceRef: "sample" },
            { id: "b3", text: "Partnered with product and compliance to define guardrails for financial advice, cutting escalations by 40%", sourceRef: "sample" },
          ],
        },
        {
          id: "r2",
          title: "Business Analyst",
          startDate: "Aug 2022",
          endDate: "Dec 2023",
          bullets: [
            { id: "b4", text: "Owned the weekly growth dashboard (SQL, Metabase) used by the leadership team to steer a $1,500,000 marketing budget", sourceRef: "sample" },
            { id: "b5", text: "Ran cohort and funnel analyses that identified onboarding drop-off, informing a redesign that lifted activation by 18%", sourceRef: "sample" },
          ],
        },
      ],
    },
    {
      id: "co2",
      name: "Sample Systems Integrator",
      location: "Jakarta, Indonesia",
      descriptor: "Enterprise software consultancy for banks and insurers",
      roles: [
        {
          id: "r3",
          title: "Software Engineer",
          startDate: "Aug 2021",
          endDate: "Jul 2022",
          bullets: [
            { id: "b6", text: "Developed claims-processing microservices in Java and Spring Boot handling 50,000 claims a month for a top-5 insurer", sourceRef: "sample" },
            { id: "b7", text: "Automated regression testing in CI, reducing release cycle from two weeks to three days" },
          ],
        },
      ],
    },
  ],
  academicProjects: [
    {
      id: "p1",
      title: "Credit Default Prediction — Applied Machine Learning",
      date: "Mar 2026",
      bullets: [
        { id: "b8", text: "Trained gradient-boosted models on 300K loan records; achieved 0.82 AUC and presented cost-sensitive thresholds to a bank panel", sourceRef: "sample" },
      ],
    },
  ],
  extracurricular: [
    {
      id: "a1",
      organisation: "SMU MITB Student Council",
      title: "Head of Industry Relations",
      date: "Sep 2025 – Present",
      bullets: [{ id: "b9", text: "Organised 6 industry talks with 400+ total attendees and secured sponsorship of $8,000", sourceRef: "sample" }],
    },
  ],
  additional: {
    certifications: ["AWS Certified Cloud Practitioner (2024)"],
    technicalSkills: ["Python (pandas, scikit-learn)", "SQL", "Tableau", "Power BI", "Java", "LLM evaluation", "Git"],
    languages: ["English (Fluent)", "Bahasa Indonesia (Native)", "Mandarin (Conversational)"],
    workAuthorization: ["Singapore Student Pass; eligible for Employment Pass"],
  },
};

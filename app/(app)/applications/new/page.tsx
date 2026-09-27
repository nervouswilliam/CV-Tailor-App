import { Suspense } from "react";
import { NewApplication } from "@/components/new/NewApplication";

export const metadata = { title: "New application · CV Tailor" };

export default function NewApplicationPage() {
  return (
    <Suspense>
      <NewApplication />
    </Suspense>
  );
}

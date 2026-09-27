import { Suspense } from "react";
import { Editor } from "@/components/editor/Editor";

export const metadata = { title: "Editor · CV Tailor" };

export default async function EditorPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  return (
    <Suspense>
      <Editor id={id} />
    </Suspense>
  );
}

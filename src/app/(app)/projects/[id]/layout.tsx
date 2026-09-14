"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProjectProvider, useProject } from "@/lib/project-context";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { cn } from "@/lib/utils";

const TABS = [
  { seg: "", label: "Overview" },
  { seg: "tasks", label: "Tasks" },
  { seg: "milestones", label: "Milestones" },
  { seg: "finance", label: "Finance" },
  { seg: "time", label: "Time" },
  { seg: "content", label: "Content" },
];

export default function ProjectLayout({ params, children }: { params: { id: string }; children: React.ReactNode }) {
  return (
    <ProjectProvider projectId={params.id}>
      <ProjectShell id={params.id}>{children}</ProjectShell>
    </ProjectProvider>
  );
}

function ProjectShell({ id, children }: { id: string; children: React.ReactNode }) {
  const { loading, notFound } = useProject();
  const pathname = usePathname();
  const base = `/projects/${id}`;

  if (loading) return <p className="text-sm text-neutral-500">Loading project...</p>;
  if (notFound)
    return (
      <div className="text-sm text-neutral-600">
        <h1 className="text-2xl font-semibold mb-2">Project not found</h1>
        <p>
          It may have been deleted or you may not have access.{" "}
          <Link href="/projects" className="underline">
            Back to projects
          </Link>
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <ProjectHeader />
      <nav className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => {
          const href = t.seg ? `${base}/${t.seg}` : base;
          const active = t.seg ? pathname === href || pathname.startsWith(href + "/") : pathname === base;
          return (
            <Link
              key={t.seg}
              href={href}
              className={cn(
                "px-3 py-2 text-sm -mb-px border-b-2 whitespace-nowrap",
                active ? "border-neutral-900 text-neutral-900 font-medium" : "border-transparent text-neutral-500 hover:text-neutral-800"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div>{children}</div>
    </div>
  );
}

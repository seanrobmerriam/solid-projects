import projects from "~/data/projects.json";
import issues from "~/data/issues.json";
import documents from "~/data/documents.json";

export type CollectionKind = "projects" | "issues" | "documents";
export type View = "overview" | CollectionKind;

export interface WorkspaceItem {
  id: string;
  title: string;
  description: string;
  status: string;
  owner: string;
  updatedAt: string;
  tags: string[];
  code?: string;
  projectId?: string;
  progress?: number;
  dueDate?: string;
  priority?: string;
  fileType?: string;
  hasFile?: boolean;
  filename?: string;
  size?: number;
  version?: string;
  createdAt?: string;
}

export const initialCollections: Record<CollectionKind, WorkspaceItem[]> = { projects, issues, documents };
export const views: { value: View; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "projects", label: "Projects" },
  { value: "issues", label: "Issues" },
  { value: "documents", label: "Documents" },
];

export const singular: Record<CollectionKind, string> = { projects: "Project", issues: "Issue", documents: "Document" };
export const viewPath = (view: View) => `/dashboard/views/${view}`;
export const formatDate = (date: string) => new Intl.DateTimeFormat("en", {
  month: "short", day: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));
export const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.round(bytes / 1024)} KB`;
export const statusTone = (status: string) => {
  if (["Completed", "Resolved", "Published"].includes(status)) return "green";
  if (["In progress", "In review"].includes(status)) return "indigo";
  if (["On hold", "Urgent", "High"].includes(status)) return "amber";
  return "neutral";
};

// components/ProjectGrid.tsx
import ProjectCard from '@/components/ProjectCard'
import { Project } from '@/app/dashboard/admin/projects/page'

export default function ProjectGrid({
  projects,
  onOpen,
  onDelete,
  deletingId,
}: {
  projects: Project[]
  onOpen: (id: string) => void
  onDelete?: (id: string) => void
  deletingId?: string | null
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          onOpen={() => onOpen(p.id)}
          onDelete={onDelete ? () => onDelete(p.id) : undefined}
          deleting={deletingId === p.id}
        />
      ))}
    </div>
  )
}
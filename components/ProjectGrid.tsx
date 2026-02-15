import { Project } from '@/app/dashboard/admin/projects/page'

type Props = {
  projects: Project[]
  onOpen: (id: string) => void
}

export default function ProjectGrid({
  projects,
  onOpen,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

      {projects.map((project) => (
        <div
          key={project.id}
          onClick={() => onOpen(project.id)}
          className="cursor-pointer border rounded-xl p-4 hover:shadow-md transition"
        >
          <h3 className="font-semibold text-lg">
            {project.name}
          </h3>

          <p className="text-sm text-gray-500 mt-1">
            {project.business_name || 'Unknown Client'}
          </p>

          <p className="text-sm text-gray-500 mt-1">
            {project.project_type || 'No type'}
          </p>

          <p className="text-xs text-gray-400 mt-2">
            {new Date(
              project.created_at
            ).toLocaleDateString()}
          </p>
        </div>
      ))}

    </div>
  )
}
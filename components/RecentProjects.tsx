import { Project } from '@/app/dashboard/admin/projects/page'

type Props = {
  projects: Project[]
  onOpen: (id: string) => void
}

export default function RecentProjects({
  projects,
  onOpen,
}: Props) {
  const recent = projects
    .filter((p) => p.last_viewed_at)
    .sort(
      (a, b) =>
        new Date(b.last_viewed_at!).getTime() -
        new Date(a.last_viewed_at!).getTime()
    )
    .slice(0, 4)

  if (recent.length === 0) return null

  return (
    <div>

      <h2 className="text-xl font-semibold mb-4">
        Recently Viewed
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {recent.map((project) => (
          <div
            key={project.id}
            onClick={() => onOpen(project.id)}
            className="cursor-pointer border rounded-xl p-4 hover:shadow-md transition"
          >
            <h3 className="font-semibold">
              {project.name}
            </h3>

            <p className="text-sm text-gray-500">
              {project.project_type || 'No type'}
            </p>
          </div>
        ))}

      </div>

    </div>
  )
}
// components/projects/ProjectCard.tsx

type Props = {
  project: {
    id: string
    name: string
    client: string
    type: string
    status: string
  }
}

export default function ProjectCard({ project }: Props) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-600 transition cursor-pointer">

      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-lg">{project.name}</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-neutral-800">
          {project.status}
        </span>
      </div>

      <p className="text-sm text-neutral-400 mb-1">
        Client: {project.client}
      </p>

      <p className="text-sm text-neutral-400">
        Type: {project.type}
      </p>

    </div>
  )
}
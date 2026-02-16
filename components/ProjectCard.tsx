// components/projects/ProjectCard.tsx
import { Project } from '@/app/dashboard/admin/projects/page'

export default function ProjectCard({
  project,
  onOpen,
  onDelete,
  deleting,
}: {
  project: Project
  onOpen: () => void
  onDelete?: () => void
  deleting?: boolean
}) {
  return (
    <div
      onClick={onOpen}
      className="group relative rounded-2xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-600 transition cursor-pointer"
    >
      {/* Hover delete */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          disabled={deleting}
          className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition text-xs border border-red-500 text-red-600 px-3 py-2 rounded-lg disabled:opacity-60"
          title="Delete project"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      )}

      <div className="space-y-2">
        <div>
          <h3 className="font-semibold text-lg text-white">{project.name}</h3>
          <p className="text-sm text-neutral-400">
            {project.business_name ?? 'Client'}
          </p>
        </div>

        <div className="text-xs text-neutral-400">
          <p>Type: {project.project_type ?? '—'}</p>
          <p>
            Created:{' '}
            {project.created_at
              ? new Date(project.created_at).toLocaleDateString()
              : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}
// components/projects/ProjectCard.tsx

import { Project } from '@/app/dashboard/admin/projects/page'

type Props = {
  project: Project
  onClick?: () => void
}

export default function ProjectCard({
  project,
  onClick,
}: Props) {
  return (
    <div
      onClick={onClick}
      className="
        rounded-2xl
        border border-neutral-800
        bg-neutral-900
        p-5
        hover:border-neutral-600
        hover:shadow-lg
        transition
        cursor-pointer
        space-y-2
      "
    >
      {/* Header */}
      <div className="flex justify-between items-start gap-2">

        <h3 className="font-semibold text-lg leading-tight">
          {project.name}
        </h3>

        {/* Status Pill */}
        <span className="text-xs px-2 py-1 rounded-full bg-neutral-800 text-neutral-300">
          Active
        </span>

      </div>

      {/* Business Name */}
      <p className="text-sm text-neutral-400 truncate">
        {project.business_name || 'No client assigned'}
      </p>

      {/* Project Type */}
      <p className="text-sm text-neutral-500">
        {project.project_type || 'General'}
      </p>

    </div>
  )
}
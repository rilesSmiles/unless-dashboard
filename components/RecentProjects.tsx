// components/projects/RecentProjects.tsx

import ProjectCard from "./ProjectCard"

export default function RecentProjects({ projects }: any) {
  return (
    <div className="mb-10">

      <h2 className="text-xl font-semibold mb-4">
        Recently Viewed
      </h2>

      <div className="grid grid-cols-4 gap-6">
        {projects.slice(0, 4).map((project: any) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

    </div>
  )
}
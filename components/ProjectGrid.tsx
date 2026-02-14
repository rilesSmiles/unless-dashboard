// components/projects/ProjectGrid.tsx

import ProjectCard from "./ProjectCard"

export default function ProjectGrid({ projects }: any) {
  return (
    <div className="grid grid-cols-4 gap-6">
      {projects.map((project: any) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  )
}
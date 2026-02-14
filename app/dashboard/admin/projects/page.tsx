// app/dashboard/admin/projects/page.tsx

"use client"

import { useState } from "react"
import { projects } from "@/lib/mockProjects"

import ProjectGrid from "@/components/ProjectGrid"
import ProjectFilters from "@/components/ProjectFilters"
import RecentProjects from "@/components/RecentProjects"

export default function ProjectsPage() {
  const [filter, setFilter] = useState("All")

  const filteredProjects =
    filter === "All"
      ? projects
      : projects.filter(p => p.type === filter)

  return (
    <div className="p-8 max-w-[1600px] mx-auto">

      {/* Recently Viewed */}
      <RecentProjects projects={projects} />

      {/* Divider */}
      <div className="border-t border-neutral-800 my-10" />

      {/* All Projects */}
      <div>

        <h2 className="text-xl font-semibold mb-4">
          All Projects
        </h2>

        <ProjectFilters
          value={filter}
          onChange={setFilter}
        />

        <ProjectGrid projects={filteredProjects} />

      </div>

    </div>
  )
}
// components/projects/ProjectFilters.tsx

type Props = {
  value: string
  onChange: (v: string) => void
}

export default function ProjectFilters({ value, onChange }: Props) {
  return (
    <div className="flex gap-3 mb-6">

      {["All", "Branding", "Strategy", "Web", "Marketing"].map(type => (
        <button
          key={type}
          onClick={() => onChange(type)}
          className={`px-4 py-2 rounded-full text-sm transition
            ${
              value === type
                ? "bg-white text-black"
                : "bg-neutral-800 text-white hover:bg-neutral-700"
            }
          `}
        >
          {type}
        </button>
      ))}

    </div>
  )
}
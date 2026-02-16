'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { name: 'HOME', href: '/dashboard/admin' },
  { name: 'PROJECTS', href: '/dashboard/admin/projects' },
  { name: 'INVOICES', href: '/dashboard/admin/invoices' },
  { name: 'ACCOUNTS', href: '/dashboard/admin/accounts' },
  { name: 'TEMPLATES', href: '/dashboard/admin/templates' },
  { name: 'PROFILE', href: '/dashboard/admin/profile' },
]

export default function AdminBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="
        fixed bottom-10 left-20 right-20
        bg-white/50 backdrop-blur
        border-black/100
        rounded-4xl
        z-50
      "
    >
      <div className="max-w-6xl mx-auto flex justify-around py-2">

        {navItems.map((item) => {
          const active = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center text-sm
                px-2 py-3 rounded-lg
                transition
                ${
                  active
                    ? 'text-black font-semibold'
                    : 'text-gray-600 hover:text-black'
                }
              `}
            >
              {item.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
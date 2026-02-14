'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { name: 'Home', href: '/dashboard/admin' },
  { name: 'Projects', href: '/app/dashboard/admin/projects' },
  { name: 'Invoices', href: '/app/dashboard/admin/invoices' },
  { name: 'Accounts', href: '/app/dashboard/admin/accounts' },
  { name: 'Templates', href: '/app/dashboard/admin/templates' },
  { name: 'Profile', href: '/app/dashboard/admin/profile' },
]

export default function AdminBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0
        bg-white/90 backdrop-blur
        border-t
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
                flex flex-col items-center text-xs
                px-2 py-1 rounded-lg
                transition
                ${
                  active
                    ? 'text-black font-semibold'
                    : 'text-gray-400 hover:text-black'
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
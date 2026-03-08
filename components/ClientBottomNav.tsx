'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { name: 'Home',      href: '/dashboard/client' },
  { name: 'Project',   href: '/dashboard/client/projects' },
  { name: 'Documents', href: '/dashboard/client/documents' },
  { name: 'Invoices',  href: '/dashboard/client/invoices' },
  { name: 'Profile',   href: '/dashboard/client/profile' },
]

export default function ClientBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200">
      <div className="flex justify-around items-center py-2 max-w-lg mx-auto">
        {navItems.map((item) => {
          const active =
            item.href === '/dashboard/client'
              ? pathname === item.href
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition"
            >
              <span
                className="text-xs font-semibold tracking-wide transition"
                style={{ color: active ? '#F04D3D' : '#999' }}
              >
                {item.name}
              </span>
              {active && (
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ background: '#F04D3D' }}
                />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

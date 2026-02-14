import AdminBottomNav from '@/components/AdminBottomNav'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen pb-16">
      {/* Main content */}
      <main>{children}</main>

      {/* Bottom Nav */}
      <AdminBottomNav />
    </div>
  )
}
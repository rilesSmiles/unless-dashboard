import ClientBottomNav from '@/components/ClientBottomNav'

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen pb-16">
      {/* Main content */}
      <main>{children}</main>

      {/* Bottom Nav */}
      <ClientBottomNav />
    </div>
  )
}
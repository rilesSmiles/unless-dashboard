import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/login')
  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <h1 className="text-black text-4xl font-bold">
        Unless HQ 🚀
      </h1>
    </main>
  );
}
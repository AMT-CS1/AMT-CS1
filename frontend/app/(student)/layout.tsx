import { cookies } from 'next/headers';
import { decodeJwt } from '@/lib/auth';
import StudentShell from '@/components/StudentShell';

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const decoded = token ? decodeJwt(token) : null;
  const username = decoded?.user_metadata?.username || decoded?.sub || 'Student';

  return <StudentShell username={username}>{children}</StudentShell>;
}

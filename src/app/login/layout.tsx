import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesso seguro ao sistema Garça Branca Gestão Rural.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Sign In',
}

export default function SignupPage() {
  redirect('/login')
}

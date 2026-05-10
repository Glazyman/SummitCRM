import { redirect } from 'next/navigation'

// Batches have moved into the Activities page under the Batches tab
export default function BatchesPage() {
  redirect('/activities')
}
